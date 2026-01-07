import hashlib
from gtts import gTTS
from openai import OpenAI
import os
from dotenv import load_dotenv

load_dotenv()

TTS_DIR = "static/tts"
client = OpenAI(
    api_key=os.getenv("OPEN_API_KEY"),
)

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

def generate_OPENAI_tts_audio(text: str) -> str:
    # ensure folder exists
    os.makedirs(TTS_DIR, exist_ok=True)

    # unique file names
    new_hashes = "gpt-4o-mini-tts"
    filename = hashlib.sha1((new_hashes + text.strip()).encode("utf-8")).hexdigest() + ".mp3"

    file_path = os.path.join(TTS_DIR, filename)

    # generate audio only once cache
    if not os.path.isfile(file_path):
         with client.audio.speech.with_streaming_response.create(
            model="gpt-4o-mini-tts",
            voice="echo",
            input=text,
            instructions="Speak in a friendly conversational tone.",
        )as response:
            response.stream_to_file(file_path)
    print("USING OPENAI TTS", file_path)

    # return browser path
    return f"/static/tts/{filename}"
