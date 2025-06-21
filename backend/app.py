import os
import json
import requests
from dotenv import load_dotenv
from flask import Flask, request, send_file, jsonify
from flask_cors import CORS
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain_community.document_loaders import PyPDFLoader
from werkzeug.utils import secure_filename
import kokoro
from kokoro import KPipeline
import soundfile as sf
import numpy as np
import re
import pdfplumber
import torch
import io
from typing import List
from agents import AgentService, SafetyStatus
import time
import requests
from datetime import datetime, timedelta
from openai import OpenAI
import whisper

load_dotenv()

# Load both API keys
api_key = os.getenv("GEMINI_API_KEY")
github_token = os.getenv("GITHUB_TOKEN")
print("🔑 Gemini API Key from env:", os.getenv("GEMINI_API_KEY"))
print("🔑 GitHub Token from env:", os.getenv("GITHUB_TOKEN"))

pipeline = KPipeline(lang_code='a')

app = Flask(__name__)

# GitHub OpenAI client setup
client = OpenAI(
    base_url="https://models.github.ai/inference",
    api_key=github_token,
) if github_token else None

# Gemini manual API call
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
GEMINI_URL = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={GEMINI_API_KEY}"
HEADERS = {
    "Content-Type": "application/json"
}

class RateLimitedGeminiAPI:
    def __init__(self, api_key):
        self.api_key = api_key
        self.last_request_time = None
        self.min_interval = 2
        self.retry_attempts = 3
        self.base_delay = 1
        
    def call_gemini_api(self, prompt):
        """Rate-limited Gemini API call with retry logic"""
        
        if not self.api_key:
            print("❌ GEMINI_API_KEY not found in environment variables")
            return None
            
        if not self.api_key.startswith('AIzaSy'):
            print(f"❌ Invalid API key format. Expected to start with 'AIzaSy'")
            return None
        
        # Rate limiting
        if self.last_request_time:
            time_since_last = time.time() - self.last_request_time
            if time_since_last < self.min_interval:
                sleep_time = self.min_interval - time_since_last
                print(f"⏱️ Rate limiting: waiting {sleep_time:.2f} seconds...")
                time.sleep(sleep_time)
        
        url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro-latest:generateContent?key={self.api_key}"
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

        print(f"🔑 Using Gemini API key: {self.api_key[:10]}...")

        for attempt in range(self.retry_attempts):
            try:
                self.last_request_time = time.time()
                response = requests.post(url, headers=headers, json=data, timeout=30)
                
                if response.status_code == 200:
                    return response.json()["candidates"][0]["content"]["parts"][0]["text"]
                    
                elif response.status_code == 429:
                    error_data = response.json()
                    retry_info = None
                    
                    if 'error' in error_data and 'details' in error_data['error']:
                        for detail in error_data['error']['details']:
                            if detail.get('@type') == 'type.googleapis.com/google.rpc.RetryInfo':
                                retry_delay = detail.get('retryDelay', '60s')
                                retry_seconds = int(retry_delay.rstrip('s'))
                                retry_info = retry_seconds
                                break
                    
                    if attempt < self.retry_attempts - 1:
                        delay = retry_info if retry_info else (self.base_delay * (2 ** attempt))
                        print(f"⚠️ Rate limit hit (attempt {attempt + 1}/{self.retry_attempts}). Waiting {delay} seconds...")
                        time.sleep(delay)
                        continue
                    else:
                        print("❌ Rate limit exceeded. Please wait before making more requests.")
                        print("💡 Consider upgrading to a paid plan for higher quotas.")
                        return None
                        
                else:
                    response.raise_for_status()
                    
            except requests.exceptions.Timeout:
                print(f"⏰ Request timeout (attempt {attempt + 1}/{self.retry_attempts})")
                if attempt < self.retry_attempts - 1:
                    time.sleep(self.base_delay * (2 ** attempt))
                    continue
                return None
                
            except requests.exceptions.HTTPError as e:
                print(f"HTTP Error calling Gemini API: {e}")
                print(f"Response content: {response.text if 'response' in locals() else 'No response'}")
                return None
                
            except Exception as e:
                print(f"Error calling Gemini API: {e}")
                return None
        
        return None

gemini_api = RateLimitedGeminiAPI(GEMINI_API_KEY)

def call_gemini_api(prompt, use_github_api=True):
    """Enhanced function to support both GitHub OpenAI and Gemini APIs"""
    
    if use_github_api and client and github_token:
        try:
            print("🚀 Using GitHub OpenAI API...")
            response = client.chat.completions.create(
                messages=[
                    {
                        "role": "system",
                        "content": "You are a helpful AI assistant that creates educational content and answers questions.",
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
            return response.choices[0].message.content
        except Exception as e:
            print(f"❌ Error calling GitHub OpenAI API: {e}")
            print("🔄 Falling back to Gemini API...")
    
    # Fall back to Gemini API
    print("🔄 Using Gemini API...")
    return gemini_api.call_gemini_api(prompt)

def process_with_gemini(text, use_github_api=True):
    """Enhanced processing with GitHub OpenAI API as primary, Gemini as fallback"""
    prompt = f"Create an interactive learning module from this content. Use LaTeX for mathematical expressions and wrap them in single or double dollar signs if required. Use markdown for other content:\n\n{text}"
    
    result = call_gemini_api(prompt, use_github_api=use_github_api)
    
    if result is None:
        print("⚠️ Both APIs failed - trying Gemini as final fallback")
        return gemini_api.call_gemini_api(prompt)
        
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
    print(f"Downloading from: {file_url}")
    
    # Extract filename more safely
    try:
        if file_url.endswith('.pdf'):
            filename = file_url.split("/")[-1]
        else:
            filename = file_url.split("/")[-2] + ".pdf"
        
        local_filename = os.path.join(DOWNLOADS_DIR, filename)
        print(f"Saving to: {local_filename}")
        
        response = requests.get(file_url, stream=True, timeout=30)
        response.raise_for_status()

        with open(local_filename, "wb") as file:
            for chunk in response.iter_content(chunk_size=8192):
                file.write(chunk)

        print(f"Successfully downloaded: {local_filename}")
        return local_filename
        
    except requests.exceptions.RequestException as e:
        print(f"Error downloading file: {e}")
        return None
    except Exception as e:
        print(f"Unexpected error in download_file: {e}")
        return None

# Fix 3: Improve extract_text_from_pdf function with better error handling
def extract_text_from_pdf(pdf_path):
    """Extract text from a PDF file with fallback methods."""
    try:
        print(f"Extracting text from: {pdf_path}")
        
        # Method 1: Try PyPDFLoader first
        try:
            loader = PyPDFLoader(pdf_path)
            pages = loader.load()
            text = "\n".join([page.page_content for page in pages if page.page_content])
            if text.strip():
                print(f"PyPDFLoader extracted {len(text)} characters")
                return text
        except Exception as e:
            print(f"PyPDFLoader failed: {e}")
        
        # Method 2: Fallback to pdfplumber
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
                    # Clean up text
                    text = re.sub(r"(\w+)\s*\n\s*(\w+)", r"\1 \2", text)
                    print(f"pdfplumber extracted {len(text)} characters")
                    return text
        except Exception as e:
            print(f"pdfplumber failed: {e}")
        
        # If both methods fail
        print("All PDF extraction methods failed")
        return ""
        
    except Exception as e:
        print(f"Error in extract_text_from_pdf: {e}")
        return ""

def split_text_for_rag(text):
    """Split the text into smaller chunks for RAG processing."""
    text_splitter = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=100)
    return text_splitter.split_text(text)

@app.route('/test-github-api', methods=['POST'])
def test_github_api():
    """Test endpoint for GitHub OpenAI API"""
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
        print(f"Error testing GitHub API: {e}")
        return jsonify({
            'error': str(e)
        }), 500

@app.route('/process-interaction', methods=['POST'])
def process_interaction():
    """Process user interaction with the AI agents."""
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
        print(f"Error processing interaction: {e}")
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
        print(i)
        print(gs)
        print(ps)
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
            # Use the saved file path, not the file object
            with pdfplumber.open(file_path) as pdf:
                text_parts = []
                for page in pdf.pages:
                    page_text = page.extract_text()
                    if page_text:
                        text_parts.append(page_text)
                text = " ".join(text_parts)
            
            print(f"Extracted text length: {len(text)}")
            
            # Clean up text
            text = re.sub(r"(\w+)\s*\n\s*(\w+)", r"\1 \2", text)
            
            # Clean up the saved file
            try:
                os.remove(file_path)
            except Exception as e:
                print(f"Warning: Could not remove temporary file: {e}")
                
        except Exception as e:
            print(f"Error extracting text from PDF: {e}")
            # Clean up the saved file even if extraction fails
            try:
                os.remove(file_path)
            except:
                pass
            return jsonify({"error": f"Could not extract text from PDF: {str(e)}"}), 400
            
    else:
        text = request.form.get("text", "").strip()
        print(f"Text from form: {text}")

    if not text:
        return jsonify({"error": "No text provided"}), 400

    try:
        audio = generate_audio(text)
        wav_file = io.BytesIO()
        sf.write(wav_file, audio, 24000, format='WAV')
        wav_file.seek(0)
        return send_file(wav_file, mimetype='audio/wav', as_attachment=False)
    except Exception as e:
        print(f"Error generating audio: {e}")
        return jsonify({"error": f"Could not generate audio: {str(e)}"}), 500

# Fix 2: Improve the is_valid_pdf function
def is_valid_pdf(file_url):
    """Check if the file is a valid PDF."""
    try:
        print(f"Validating PDF: {file_url}")
        
        # Quick check for known PDF hosting services
        if any(domain in file_url.lower() for domain in ['ucarecdn.com', 'drive.google.com', 'dropbox.com']):
            print("Trusted domain detected")
            return True
        
        # Check file extension
        if file_url.lower().endswith('.pdf'):
            print("PDF extension found")
            return True
            
        # Make a HEAD request to check content type
        response = requests.head(file_url, timeout=10, allow_redirects=True)
        response.raise_for_status()

        content_type = response.headers.get('content-type', '').lower()
        print(f"Content-Type: {content_type}")
        
        if 'application/pdf' in content_type:
            return True

        # If content-type check fails, try reading first few bytes
        response = requests.get(file_url, stream=True, timeout=10)
        response.raise_for_status()
        
        # Read first 4 bytes to check PDF magic number
        first_chunk = next(response.iter_content(chunk_size=4), b'')
        is_pdf = first_chunk.startswith(b'%PDF')
        print(f"PDF magic number check: {is_pdf}")
        
        return is_pdf
        
    except Exception as e:
        print(f"Error validating PDF: {e}")
        # If validation fails, assume it might be valid and let download_file handle it
        return True

@app.route("/", methods=["GET"])
def home():
    return jsonify({"status": "MindFlow backend is running 🚀"})

# Fix 4: Update the process_content route with better error handling
@app.route('/process-content', methods=['POST'])
def process_content():
    """Process uploaded content with enhanced error handling."""
    try:
        data = request.json
        if not data:
            return jsonify({'error': 'No data provided'}), 400
            
        print("🔍 FULL REQUEST DATA:", json.dumps(data, indent=2))
        
        notes = data.get('notes', '')
        files = data.get('files', [])
        
        print(f"📝 Notes: '{notes}' (length: {len(notes) if notes else 0})")
        print(f"📁 Files array: {files} (count: {len(files)})")
        
        # Check if frontend sent files correctly
        if not files and not notes.strip():
            return jsonify({
                'error': 'No files or notes provided. Please upload PDF files or add notes.',
                'debug_info': {
                    'received_files': files,
                    'received_notes_length': len(notes) if notes else 0
                }
            }), 400

        all_text = []

        # Add notes if provided
        if notes and notes.strip():
            all_text.append(notes.strip())
            print("✅ Added notes to processing")

        # Process files only if they exist
        if files and len(files) > 0:
            print(f"🔄 Processing {len(files)} files...")
            
            for i, file_url in enumerate(files):
                print(f"📄 Processing file {i+1}: '{file_url}'")

                if not file_url or not file_url.strip():
                    print(f"⚠️ Skipping empty file URL at index {i}")
                    continue

                file_url = file_url.strip()
                
                # Download and process file
                local_file = download_file(file_url)
                if not local_file:
                    return jsonify({
                        'error': f'Could not download file {i+1}. Please check the URL: {file_url}'
                    }), 400
                
                try:
                    text = extract_text_from_pdf(local_file)
                    if text and text.strip():
                        all_text.append(text.strip())
                        print(f"✅ Extracted {len(text)} characters from file {i+1}")
                    else:
                        print(f"⚠️ No text extracted from file {i+1}")
                        
                except Exception as e:
                    print(f"❌ Error extracting text from file {i+1}: {e}")
                    return jsonify({
                        'error': f'Could not extract text from PDF {i+1}: {str(e)}'
                    }), 400
                finally:
                    # Cleanup
                    try:
                        if local_file and os.path.exists(local_file):
                            os.remove(local_file)
                    except Exception as e:
                        print(f"⚠️ Could not clean up {local_file}: {e}")
        else:
            print("📁 No files to process (files array is empty)")

        # Check final content
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
        print(f"📄 Final combined text length: {len(combined_text)}")
        
        # Process with AI
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
        print(f"❌ Unexpected error: {e}")
        import traceback
        traceback.print_exc()
        
        return jsonify({
            'error': 'Server error occurred',
            'technical_error': str(e)
        }), 500

@app.route("/get-summary", methods=["GET"])
def get_summary():
    """Get a summary of the current learning session."""
    summary = agent_service.get_session_summary()
    return jsonify(summary.to_dict())

model = whisper.load_model("base")

@app.route('/speech2text', methods=['POST'])
def transcribe():
    """Converts speech audio to text using Whisper model"""
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
    """Use AI APIs to provide deeper explanations based on previous context"""
    try:
        data = request.json
        question = data.get('question')
        context = data.get('context', '')
        
        prompt = f"""Using the following context and question, provide a detailed explanation:
        
        Context: {context}
        
        Question: {question}
        
        Provide a thorough explanation that incorporates the context and addresses the question directly."""
        
        response_text = call_gemini_api(prompt)
        
        if not response_text:
            return jsonify({
                'error': 'Failed to get response from AI APIs'
            }), 500

        chat_history.append({
            "question": question,
            "answer": response_text,
            "timestamp": datetime.now().isoformat()
        })
        
        return jsonify({
            'response': response_text,
            'status': 'success'
        })
        
    except Exception as e:
        print(f"Error in explain-more: {e}")
        return jsonify({
            'error': str(e)
        }), 500

@app.route('/interactive-questions', methods=['POST'])
def interactive_questions():
    """Generate and process interactive questions using AI APIs"""
    try:
        data = request.json
        context = data.get('context', '')
        
        prompt = f"""Based on this content, generate 3 interactive questions to test understanding. 
        Format your response as a JSON array of questions, where each question has:
        - question_text: the actual question
        - options: array of 4 possible answers
        - correct_answer: the correct answer
        - explanation: explanation of why this is correct
        
        Content: {context}"""
        
        response_text = call_gemini_api(prompt)
        try:
            questions = json.loads(response_text)
        except json.JSONDecodeError:
            questions = [{
                "question_text": "Could not generate proper questions.",
                "options": ["Try again", "Contact support"],
                "correct_answer": "Try again",
                "explanation": "There was an error processing the content."
            }]
        
        chat_history.append({
            "type": "interactive_questions",
            "questions": questions,
            "timestamp": datetime.now().isoformat()
        })
        
        return jsonify({
            'questions': questions,
            'status': 'success'
        })
        
    except Exception as e:
        print(f"Error in interactive-questions: {e}")
        return jsonify({
            'error': str(e)
        }), 500

if __name__ == "__main__":
    app.run(debug=True)