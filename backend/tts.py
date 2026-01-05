import hashlib
import os
from gtts import gTTS

TTS_DIR = "static/tts"

def generate_tts_audio(text: str) -> str:
    # ensure folder exists
    os.makedirs(TTS_DIR, exist_ok=True)

    # unique file names
    filename = hashlib.sha1(text.strip().encode("utf-8")).hexdigest() + ".mp3"

    file_path = os.path.join(TTS_DIR, filename)

    # generate audio only once cache
    if not os.path.isfile(file_path):
        gTTS(text=text, lang="en", slow=False).save(file_path)

    # return browser path
    return f"/static/tts/{filename}"
