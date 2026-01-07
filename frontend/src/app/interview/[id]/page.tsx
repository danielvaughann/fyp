"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";

// define structure of api response
type CurrentResponse = {
    done: boolean;
    index?: number;
    total?: number;
    question: null | {
        id: number;
        text: string;
        difficulty: string;
        topic: string;
        audio_url?: string; //tts file url
    };
};
// main component exported from this file
export default function InterviewPage() {
    const router = useRouter();
    // extract url parameters [id]
    const params = useParams<{ id: string }>();
    const sessionId = params.id;

    const [current, setCurrent] = useState<CurrentResponse | null>(null); // current question data
    const [answer, setAnswer] = useState("");
    const [error, setError] = useState("");

    //tts
    const audioRef = useRef<HTMLAudioElement | null>(null);  // reference to audio element between renders for tts
    const [autoPlayBlocked, setAutoPlayBlocked] = useState(false); //tracks if browser blocks autoplay

    //stt
    const recorderRef = useRef<MediaRecorder | null>(null); // media recorder reference for recording audio
    const streamRef = useRef<MediaStream | null>(null); // media stream reference for microphone access
    const chunksRef = useRef<BlobPart[]>([]); // recorded audio chunks reference
    const [isRecording, setIsRecording] = useState(false); // recording state
    const [isTranscribing, setIsTranscribing] = useState(false); // if transcription is in progress

    //ui
    const [mode, setMode] = useState<"voice" | "text">("voice");  // answering with voice or text (testing purposes)
    const [previousTranscript, setPreviousTranscript] = useState(""); // previous transcribed text
    const [autoSubmit,setAutoSubmit] = useState(true); // auto submit after voice transcription

    // get current question from api
    async function loadCurrentQuestion() {
        setError("");
        const token = localStorage.getItem("token");
        if (!token) {
            router.push("/login");
            return;
        }
        const res = await fetch(`http://localhost:8000/interview/${sessionId}/current`, {
            headers: {Authorization: `Bearer ${token}`,},
        });

        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
            let message = "Failed to load current question";

            if (typeof data.detail === "string") {
                message = data.detail;
            } else if (Array.isArray(data.detail) && data.detail.length > 0) {
                message = data.detail[0]?.msg || message;
            }

            setError(message);
            return;
        }
        // if interview is done
        if (data.done) {
            router.push(`/results/${sessionId}`);
            return;
        }
        // set current question data triggers tts
        setCurrent(data);
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps, react-hooks/set-state-in-effect
    // load current question when component mounts or sessionid changes
    useEffect(() => {
        loadCurrentQuestion();
    }, [sessionId]); // runs again when session id changes

    async function submitAnswer() {
        await submitTranscribedAnswer(answer);
    }

    // tts plays next question when a new question url loads
    useEffect(() => {
      const audioUrl = current?.question?.audio_url;
      if (!audioUrl) return;

      //allow autoplay
      setAutoPlayBlocked(false)

      // stop any current audio playing
      if (audioRef.current) {
        audioRef.current.pause();
      }

      //create new audio element and play
      const audio = new Audio(`http://localhost:8000${audioUrl}`);
      audioRef.current = audio;

      audio.play().catch(() => {
        //if autoplay blocked is blocked manual play button appears
        setAutoPlayBlocked(true);
      });

      //cleanup by pausing audio when component unmounts
      return () => {
        audio.pause();
      };
    }, [current?.question?.audio_url]); // runs when url changes

    //stop mircophonne
    const stopMic = () => {
        if (!streamRef.current) return;
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
    }
    //stop recording
    const stopAudioRecorder = () => {
        if (!recorderRef.current) return;
        if (recorderRef.current.state !== "inactive")
            recorderRef.current.stop();
    }
    //uploads audio blob to bakcend api for transcription
    async function uploadAndTranscribe(blob:Blob) {
        setIsTranscribing(true);
        setError("");

        const token = localStorage.getItem("token");
        if (!token) {
            router.push("/login");
            return;
        }

        try {
            // prepare form data key value filename
            const formData = new FormData();
            formData.append("file", blob, "answer.webm");

            const res = await fetch(`http://localhost:8000/stt/transcribe`, {
                method: "POST",
                headers: {Authorization: `Bearer ${token}`,},
                body: formData,
            });

            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                let message = "Failed to transcribe audio";

                if (typeof data.detail === "string") {
                    message = data.detail;
                } else if (Array.isArray(data.detail) && data.detail.length > 0) {
                    message = data.detail[0]?.msg || message;
                }
                setError(message);
                setIsTranscribing(false);
                return;
            }
            // extract transcipt
            const transcript = data.transcript || "";
            setAnswer(transcript) // put answer into text box

            //autosubmit for voice
            if(mode === "voice" && autoSubmit){
                await submitTranscribedAnswer(transcript);
            }
        } catch {
            setError("Failed to upload and transcribe audio");
        }
        setIsTranscribing(false);
    }

    /// stt recording
    // recording using media recorder
    async function startRecording() {
        setError("")

        try{
            // request microphone access
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            streamRef.current = stream;

            //media recorder to capture audio from stream
            const recorder = new MediaRecorder(stream);
            recorderRef.current = recorder;

            //audio chunks array
            chunksRef.current = [];

            // event handler collects data when it becomes availble
            recorder.ondataavailable = function (event) {
                if (event.data.size > 0) {
                    chunksRef.current.push(event.data);
                }
        }
            recorder.onstop = async () => {
              stopMic();
              //create blob of audio chunks
              const blob = new Blob(chunksRef.current, { type: recorder.mimeType });
              //sends blob to backend
              await uploadAndTranscribe(blob);
            };

            // start recording
            recorder.start();
            setIsRecording(true);
          } catch {
            setError("Microphone permission denied or recording failed");
          }
        }

    function stopRecording()    {
        stopAudioRecorder();
        setIsRecording(false);
  }
    async function submitTranscribedAnswer(text:string) {
        setError("")

        const token = localStorage.getItem("token");
        if (!token) {
            router.push("/login");
            return;
        }

        // check answer is not empty
        if (!text.trim()) {
            setError("Answer cannot be empty");
            return;
        }

        const res = await fetch(`http://localhost:8000/interview/${sessionId}/answer`, {
            method: "POST",
            headers: {"Content-Type": "application/json", Authorization: `Bearer ${token}`,},
            body: JSON.stringify({ transcript: text }),
        });

        const data = await res.json().catch(() => ({}));
        if(!res.ok) {
            let message = "Failed to submit answer";
            if (typeof data.detail === "string") {
                message = data.detail;
            } else if (Array.isArray(data.detail) && data.detail.length > 0) {
                message = data.detail[0]?.msg || message;
            }
            setError(message);
            return;
        }

        //clear answer box
        setAnswer("");
        if (data.completed) {
            router.push(`/results/${sessionId}`);
            return;
        }
        loadCurrentQuestion();
    }

    return (
      <div className="page">
        <h2>Interview</h2>
          {/*  */}
        {error && <p className="error">{error}</p>}
        {!current && <p>Loading...</p>}
          {/* main interview page  */}
        {current && current.question && (
          <>
            <div>
                {/* question counter  */}
              <p>
                Question {(current.index ?? 0) + 1} / {current.total ?? "?"}
              </p>
              <p>{current.question.text}</p>
                <p>{current.question.topic}</p>
              <textarea
                value={answer}
                onChange={(e) => setAnswer((e.target as HTMLTextAreaElement).value)}
                rows={6}
                cols={60}
                disabled={mode === "voice" && autoSubmit}
              />
              <br />
                {/* manually replay audio */}
              <button onClick={submitAnswer}>Submit Answer</button>
              <button
                onClick={() => {
                  const audio_file = audioRef.current;
                  if (!audio_file) return;

                  audio_file.currentTime = 0;
                  audio_file.play().catch(() => {
                    // autoplay blocked — show message
                    setAutoPlayBlocked(true);
                  });
                }}
              >
                Play question audio
              </button>
              {autoPlayBlocked && (
                <p style={{ marginTop: 6 }}>Your browser blocked autoplay</p>
              )}
            </div>
            <div style={{ marginTop: 10, marginBottom: 10 }}>
                {/* button disables itself once clicked */}
              <button
                type="button"
                onClick={() => setMode("voice")}
                disabled={mode === "voice"}
              >
                Voice Mode
              </button>

              <button
                type="button"
                onClick={() => setMode("text")}
                disabled={mode === "text"}
                style={{ marginLeft: 8 }}
              >
                Text Mode
              </button>

              {mode === "voice" && (
                <label style={{ marginLeft: 12 }}>
                  <input
                    type="checkbox"
                    checked={autoSubmit}
                    onChange={(e) => setAutoSubmit(e.target.checked)}
                  />
                  Auto-submit after transcription
                </label>
              )}
            </div>
            {mode === "voice" && (
                <>
                    <div style={{marginTop: 10}}>
                        {!isRecording && (
                            <button type="button" onClick={startRecording} disabled={isTranscribing}>
                                Start Answer (Voice)
                            </button>
                        )}

                        {isRecording && (
                            <button type="button" onClick={stopRecording}>
                                Stop Answer
                            </button>
                        )}

                        {isTranscribing && <p style={{marginTop: 6}}>Transcribing...</p>}
                    </div>

                </>

            )}


          </>
        )}
      </div>
    );
}