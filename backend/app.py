import os
import json
import requests
from dotenv import load_dotenv
from flask import Flask, request, send_file, jsonify
from flask_cors import CORS
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain_community.document_loaders import PyPDFLoader
from werkzeug.utils import secure_filename
import kokoro_local as kokoro
from kokoro_local import KPipeline
import soundfile as sf
import numpy as np
import re
import pdfplumber
import torch
import io
from typing import List
from agents import AgentService, SafetyStatus
import time
from datetime import datetime, timedelta
from openai import OpenAI
import whisper

load_dotenv()

api_key = os.getenv("GEMINI_API_KEY")
github_token = os.getenv("GITHUB_TOKEN")

pipeline = KPipeline(lang_code='a')

app = Flask(__name__)

client = OpenAI(
    base_url="https://models.github.ai/inference",
    api_key=github_token,
) if github_token else None

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

class RateLimitedGeminiAPI:
    def __init__(self, api_key, model="gemini-1.5-pro-latest"):
        self.api_key = api_key
        self.last_request_time = None
        self.min_interval = 1
        self.retry_attempts = 2
        self.base_delay = 0.5
        self.model = model
        
    def call_gemini_api(self, prompt, model_override=None):
        if not self.api_key:
            return None
        if not self.api_key.startswith('AIzaSy'):
            return None
        if self.last_request_time:
            time_since_last = time.time() - self.last_request_time
            if time_since_last < self.min_interval:
                sleep_time = self.min_interval - time_since_last
                time.sleep(sleep_time)
        url = (
            f"https://generativelanguage.googleapis.com/v1beta/models/"
            f"{model_override or self.model}:generateContent?key={self.api_key}"
        )
        headers = {"Content-Type": "application/json"}
        data = {
            "contents": [
                {
                    "parts": [
                        {"text": prompt}
                    ]
                }
            ]
        }
        for attempt in range(self.retry_attempts):
            try:
                self.last_request_time = time.time()
                response = requests.post(url, headers=headers, json=data, timeout=15)
                if response.status_code == 200:
                    return response.json()["candidates"][0]["content"]["parts"][0]["text"]
                elif response.status_code == 429:
                    if attempt < self.retry_attempts - 1:
                        time.sleep(self.base_delay * (2 ** attempt))
                        continue
                    else:
                        return None
                else:
                    response.raise_for_status()
            except Exception:
                if attempt < self.retry_attempts - 1:
                    time.sleep(self.base_delay * (2 ** attempt))
                    continue
                return None
        return None

gemini_api = RateLimitedGeminiAPI(GEMINI_API_KEY, model="gemini-1.5-pro-latest")
gemini_flash_api = RateLimitedGeminiAPI(GEMINI_API_KEY, model="gemini-1.5-flash")

def call_gemini_api(prompt, use_github_api=True, model_override=None):
    if use_github_api and client and github_token:
        try:
            response = client.chat.completions.create(
                messages=[
                    {
                        "role": "system",
                        "content": "You are a helpful AI assistant that creates educational content and answers questions. Always include at least one diagram or visual explanation in the output.",
                    },
                    {
                        "role": "user",
                        "content": prompt,
                    }
                ],
                model="openai/gpt-4o",
                temperature=0.8,
                max_tokens=1800,
                top_p=1
            )
            return response.choices[0].message.content
        except Exception:
            pass
    api = gemini_flash_api if model_override == "flash" else gemini_api
    return api.call_gemini_api(prompt, model_override="gemini-1.5-flash" if model_override == "flash" else None)

def build_prompt_with_heading_and_diagram(title, content, icon="📘"):
    return (
        f"## {icon} {title}\n"
        "Please answer in the following format:\n"
        "- Start with a large, bold markdown heading (##) and a relevant icon for the topic.\n"
        "- Add a diagram (as a Markdown image, ASCII, or a creative visual analogy) and provide a caption. If you can't generate an image, use ASCII or a creative analogy in markdown.\n"
        "- Structure your explanation as concise bullet points (not paragraphs).\n"
        "- Always include the diagram and the points, even if you must invent a visual analogy.\n\n"
        f"Content to answer: {content}\n"
    )

def process_with_gemini(text, use_github_api=True):
    summary_title = "AI Answer"
    prompt = build_prompt_with_heading_and_diagram(summary_title, text, "📘")
    result = call_gemini_api(prompt, use_github_api=use_github_api, model_override="flash")
    if result is None:
        return gemini_flash_api.call_gemini_api(prompt, model_override="gemini-1.5-flash")
    return result

chat_history = []
vector_store = None
CORS(app, resources={r"/*": {"origins": ["http://localhost:3000"], "methods": ["GET", "POST"], "allow_headers": ["Content-Type"]}})
agent_service = AgentService(api_key=GEMINI_API_KEY)

DOWNLOADS_DIR = "downloads"
UPLOAD_FOLDER = "uploads"
os.makedirs(DOWNLOADS_DIR, exist_ok=True)
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

def download_file(file_url):
    try:
        if file_url.endswith('.pdf'):
            filename = file_url.split("/")[-1]
        else:
            filename = file_url.split("/")[-2] + ".pdf"
        local_filename = os.path.join(DOWNLOADS_DIR, filename)
        response = requests.get(file_url, stream=True, timeout=30)
        response.raise_for_status()
        with open(local_filename, "wb") as file:
            for chunk in response.iter_content(chunk_size=8192):
                file.write(chunk)
        return local_filename
    except requests.exceptions.RequestException:
        return None
    except Exception:
        return None

def extract_text_from_pdf(pdf_path):
    try:
        try:
            loader = PyPDFLoader(pdf_path)
            pages = loader.load()
            text = "\n".join([page.page_content for page in pages if page.page_content])
            if text.strip():
                return text
        except Exception:
            pass
        try:
            import pdfplumber
            with pdfplumber.open(pdf_path) as pdf:
                text_parts = []
                for page in pdf.pages:
                    page_text = page.extract_text()
                    if page_text:
                        text_parts.append(page_text)
                if text_parts:
                    text = "\n".join(text_parts)
                    text = re.sub(r"(\w+)\s*\n\s*(\w+)", r"\1 \2", text)
                    return text
        except Exception:
            pass
        return ""
    except Exception:
        return ""

def split_text_for_rag(text):
    text_splitter = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=100)
    return text_splitter.split_text(text)

@app.route('/test-github-api', methods=['POST'])
def test_github_api():
    try:
        data = request.json
        prompt = data.get('prompt', 'What is the capital of France?')
        if not client:
            return jsonify({
                'error': 'GitHub API not configured. Please set GITHUB_TOKEN environment variable.'
            }), 400
        response = client.chat.completions.create(
            messages=[
                {
                    "role": "system",
                    "content": "You are a helpful AI assistant.",
                },
                {
                    "role": "user",
                    "content": prompt,
                }
            ],
            model="openai/gpt-4o",
            temperature=1,
            max_tokens=4096,
            top_p=1
        )
        return jsonify({
            'response': response.choices[0].message.content,
            'status': 'success',
            'api_used': 'github_openai'
        })
    except Exception as e:
        return jsonify({
            'error': str(e)
        }), 500

@app.route('/process-interaction', methods=['POST'])
def process_interaction():
    try:
        data = request.json
        user_input = data.get('input')
        if not user_input:
            return jsonify({
                'error': 'No input provided'
            }), 400
        current_topic = data.get('current_topic')
        active_subtopic = data.get('active_subtopic')
        session_history = data.get('session_history')
        response = agent_service.start_new_topic(user_input, current_topic=current_topic, active_subtopic=active_subtopic, session_history=session_history)
        response_dict = response.to_dict()
        return jsonify(response_dict)
    except Exception as e:
        return jsonify({
            'error': str(e)
        }), 500

def generate_audio(text):
    generator = pipeline(
        text, voice='af_heart',
        speed=1
    )
    all_audio = []
    for i, (gs, ps, audio) in enumerate(generator):
        all_audio.append(audio)
    final_audio = np.concatenate(all_audio)
    return final_audio

@app.route("/process-text2speech", methods=["POST"])
def process_text2speech():
    text = ""
    if "pdf" in request.files:
        file = request.files["pdf"]
        if file.filename == "":
            return jsonify({"error": "No selected file"}), 400
        filename = secure_filename(file.filename)
        file_path = os.path.join(UPLOAD_FOLDER, filename)
        file.save(file_path)
        try:
            with pdfplumber.open(file_path) as pdf:
                text_parts = []
                for page in pdf.pages:
                    page_text = page.extract_text()
                    if page_text:
                        text_parts.append(page_text)
                text = " ".join(text_parts)
            text = re.sub(r"(\w+)\s*\n\s*(\w+)", r"\1 \2", text)
            try:
                os.remove(file_path)
            except Exception:
                pass
        except Exception as e:
            try:
                os.remove(file_path)
            except:
                pass
            return jsonify({"error": f"Could not extract text from PDF: {str(e)}"}), 400
    else:
        text = request.form.get("text", "").strip()
    if not text:
        return jsonify({"error": "No text provided"}), 400
    try:
        audio = generate_audio(text)
        wav_file = io.BytesIO()
        sf.write(wav_file, audio, 24000, format='WAV')
        wav_file.seek(0)
        return send_file(wav_file, mimetype='audio/wav', as_attachment=False)
    except Exception as e:
        return jsonify({"error": f"Could not generate audio: {str(e)}"}), 500

def is_valid_pdf(file_url):
    try:
        if any(domain in file_url.lower() for domain in ['ucarecdn.com', 'drive.google.com', 'dropbox.com']):
            return True
        if file_url.lower().endswith('.pdf'):
            return True
        response = requests.head(file_url, timeout=10, allow_redirects=True)
        response.raise_for_status()
        content_type = response.headers.get('content-type', '').lower()
        if 'application/pdf' in content_type:
            return True
        response = requests.get(file_url, stream=True, timeout=10)
        response.raise_for_status()
        first_chunk = next(response.iter_content(chunk_size=4), b'')
        is_pdf = first_chunk.startswith(b'%PDF')
        return is_pdf
    except Exception:
        return True

@app.route("/", methods=["GET"])
def home():
    return jsonify({"status": "MindFlow backend is running 🚀"})

@app.route('/process-content', methods=['POST'])
def process_content():
    try:
        data = request.json
        if not data:
            return jsonify({'error': 'No data provided'}), 400
        notes = data.get('notes', '')
        files = data.get('files', [])
        if not files and not notes.strip():
            return jsonify({
                'error': 'No files or notes provided. Please upload PDF files or add notes.',
                'debug_info': {
                    'received_files': files,
                    'received_notes_length': len(notes) if notes else 0
                }
            }), 400
        all_text = []
        if notes and notes.strip():
            all_text.append(notes.strip())
        if files and len(files) > 0:
            for i, file_url in enumerate(files):
                if not file_url or not file_url.strip():
                    continue
                file_url = file_url.strip()
                local_file = download_file(file_url)
                if not local_file:
                    return jsonify({
                        'error': f'Could not download file {i+1}. Please check the URL: {file_url}'
                    }), 400
                try:
                    text = extract_text_from_pdf(local_file)
                    if text and text.strip():
                        all_text.append(text.strip())
                except Exception as e:
                    return jsonify({
                        'error': f'Could not extract text from PDF {i+1}: {str(e)}'
                    }), 400
                finally:
                    try:
                        if local_file and os.path.exists(local_file):
                            os.remove(local_file)
                    except Exception:
                        pass
        if not all_text:
            return jsonify({
                'error': 'No content to process. Please provide PDF files with readable text or add notes.',
                'debug_info': {
                    'files_received': len(files),
                    'notes_length': len(notes) if notes else 0,
                    'text_extracted': len(all_text)
                }
            }), 400
        combined_text = "\n\n".join(all_text)
        processed_content = process_with_gemini(combined_text)
        if not processed_content:
            return jsonify({
                'error': 'AI processing failed. Please try again.'
            }), 503
        return jsonify({
            'response': processed_content,
            'status': 'success',
            'debug_info': {
                'content_length': len(combined_text),
                'files_processed': len(files),
                'had_notes': bool(notes and notes.strip())
            }
        })
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({
            'error': 'Server error occurred',
            'technical_error': str(e)
        }), 500

@app.route("/get-summary", methods=["GET"])
def get_summary():
    summary = agent_service.get_session_summary()
    return jsonify(summary.to_dict())

model = whisper.load_model("base")

@app.route('/speech2text', methods=['POST'])
def transcribe():
    temp_file = "temp_audio.wav"
    if 'file' in request.files:
        file = request.files['file']
        file.save(temp_file)
    elif request.data:
        with open(temp_file, "wb") as f:
            f.write(request.data)
    else:
        return jsonify({"error": "No audio data received"}), 400
    result = model.transcribe(temp_file)
    os.remove(temp_file)  
    return jsonify({"text": result["text"]})

@app.route('/explain-more', methods=['POST'])
def explain_more():
    try:
        data = request.json
        question = data.get('question')
        context = data.get('context', '')
        prompt = build_prompt_with_heading_and_diagram("More About This Topic", context, "🤔")
        response_text = call_gemini_api(prompt, model_override=None)
        if not response_text:
            return jsonify({'error': 'Failed to get response from AI APIs'}), 500
        return jsonify({'response': response_text, 'status': 'success'})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/interactive-questions', methods=['POST'])
def interactive_questions():
    try:
        data = request.json
        context = data.get('context', '')
        prompt = (
            "You are an educational quiz generator.\n"
            "Given the topic below, generate exactly 3 multiple-choice questions in this strict JSON format:\n"
            "[\n"
            "  {\n"
            "    \"question_text\": \"...\",\n"
            "    \"options\": [\"...\", \"...\", \"...\", \"...\"],\n"
            "    \"correct_answer\": \"...\",\n"
            "    \"explanation\": \"...\",\n"
            "    \"diagram\": \"(Provide a Markdown image, ASCII, or visual analogy for this question and explanation, and label it. Render as markdown string.)\"\n"
            "  },\n"
            "  ...\n"
            "]\n"
            "For each question, the explanation must:\n"
            "- Start with a big heading with an icon\n"
            "- Include the diagram (as markdown)\n"
            "- Then, give the explanation as bullet points (not a paragraph)\n"
            "Return only a JSON array of question objects. Do not add any extra text before or after the array.\n"
            f"Topic: {context}"
        )
        response_text = call_gemini_api(prompt, model_override="flash")
        try:
            questions = json.loads(response_text)
        except Exception:
            questions = [{
                "question_text": "Could not generate proper questions.",
                "options": ["Try again", "Contact support"],
                "correct_answer": "Try again",
                "explanation": "There was an error processing the content.",
                "diagram": ""
            }]
        return jsonify({'questions': questions, 'status': 'success'})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == "__main__":
    app.run(debug=True)