# kokoro.py

from gtts import gTTS
import numpy as np
import tempfile
import soundfile as sf

class KPipeline:
    def __init__(self, lang_code='en'):
        self.lang = lang_code

    def __call__(self, text, voice=None, speed=1):
        tts = gTTS(text=text, lang=self.lang, slow=False)
        with tempfile.NamedTemporaryFile(delete=True, suffix=".mp3") as f:
            tts.save(f.name)
            data, samplerate = sf.read(f.name)
            yield "placeholder", "params", data
