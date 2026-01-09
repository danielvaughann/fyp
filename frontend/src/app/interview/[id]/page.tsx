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

type TimeoutHandle = ReturnType<typeof setTimeout>;
type IntervalHandle = ReturnType<typeof setInterval>;
// main component exported from this file
export default function InterviewPage() {
    const router = useRouter();
    // extract url parameters [id]
    const params = useParams<{ id: string }>();
    const sessionId = params.id;

    // interview state
    const [current, setCurrent] = useState<CurrentResponse | null>(null); // current question data
    const [answer, setAnswer] = useState("");
    const [error, setError] = useState("");

    //tts
    const audioRef = useRef<HTMLAudioElement | null>(null);  // reference to audio element between renders for tts
    const [autoPlayBlocked, setAutoPlayBlocked] = useState(false); //tracks if browser blocks autoplay
    const [isTtsPlaying, setIsTtsPlaying] = useState(false); // if tts audio is playing

    //stt
    const recorderRef = useRef<MediaRecorder | null>(null); // media recorder reference for recording audio
    const streamRef = useRef<MediaStream | null>(null); // media stream reference for microphone access
    const chunksRef = useRef<BlobPart[]>([]); // recorded audio chunks reference
    const [isRecording, setIsRecording] = useState(false); // recording state
    const [isTranscribing, setIsTranscribing] = useState(false); // if transcription is in progress

    //ui
    const [autoSubmit, setAutoSubmit] = useState(true); // auto submit after voice transcription
    const [showBackupControls, setShowBackupControls] = useState(false); //show buttons if vad isnt working
    // timer to delay stopping mic after speech ends
    const stopTimerRef = useRef<TimeoutHandle | null>(null);



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
            audioRef.current.currentTime=0;
        }

        //create new audio element and play
        const audio = new Audio(`http://localhost:8000${audioUrl}`);
        audioRef.current = audio;

        // record if tts is playing so vad doesnt start while interviewer is speaking
        setIsTtsPlaying(true)
        audio.onended = () => setIsTtsPlaying(false)

        audio.play().catch(() => {
            //if autoplay blocked is blocked manual play button appears
            setAutoPlayBlocked(true);
            setIsTtsPlaying(false)
        });

        //cleanup by pausing audio when component unmounts
        return () => {
            audio.pause();
            setIsTtsPlaying(false)
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
    async function uploadAndTranscribe(blob: Blob) {
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
            if (autoSubmit) {
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
        if (isRecording || isTranscribing || isTtsPlaying) return;
        setError("")

        try {
            // request microphone access
            const stream = await navigator.mediaDevices.getUserMedia({audio: true});
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
                const blob = new Blob(chunksRef.current, {type: recorder.mimeType});
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

    function stopRecording() {
        stopAudioRecorder();
        setIsRecording(false);
    }

    async function submitTranscribedAnswer(text: string) {
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
            body: JSON.stringify({transcript: text}),
        });

        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
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

    // detect voice
    function useVad({onSpeechStart, onSpeechEnd}: {

        //callback functions
        onSpeechStart: () => void;
        onSpeechEnd: () => void
    }) {

        // is the vad listening?
        const [listening, setListening] = useState(false);

        //microphone and web audio references
        const streamRefVad = useRef<MediaStream | null>(null); // microphone stream
        const analyserRef = useRef<AnalyserNode | null>(null); // analyses audio data
        const audioCtxRef = useRef<AudioContext | null>(null);
        const intervalRef = useRef<IntervalHandle | null>(null); // controls 100ms interval

        // voice active state
        const vadRef = useRef({speaking: false, silenceCount: 0});

        // vad begins to listen
        const start = async () => {
            if (listening) return;

            // gets microphone access
            const stream = await navigator.mediaDevices.getUserMedia({audio: true});
            streamRefVad.current = stream;

           //webAudio api
            const audioContext = new AudioContext();
            audioCtxRef.current = audioContext;

            // analyser node to process audio
            const analyser = audioContext.createAnalyser();
            analyserRef.current = analyser;

            // connect microphone to analyser
            const source = audioContext.createMediaStreamSource(stream);
            source.connect(analyser);

            // control numberr of frequency bins
            analyser.fftSize = 256;

            // vad is running
            setListening(true);


            // check volume at 100ms intervals
            const checkVolume = () => {
                if (!analyserRef.current) return;

                //buffer to recieve frequency data
                const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);

                //fills each frequency bin with data
                analyserRef.current.getByteFrequencyData(dataArray);

                // calculate average volume of all bins
                const volume = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;

                // noise threshold
                const isSpeaking = volume > 20;

                // silence to speaking transition
                if (isSpeaking && !vadRef.current.speaking) {
                    // speaking mode
                    vadRef.current.speaking = true;
                    vadRef.current.silenceCount = 0
                    onSpeechStart()

                    // silence interval
                } else if (!isSpeaking && vadRef.current.speaking) {
                    vadRef.current.silenceCount++
                    if (vadRef.current.silenceCount > 10) { // 3 intervals of silence
                        vadRef.current.speaking = false;
                        onSpeechEnd()
                    }
                }
                // reset silence counter if speaking continues
                if(isSpeaking && vadRef.current.speaking){
                    vadRef.current.silenceCount = 0
                }
            }
            intervalRef.current = setInterval(checkVolume, 100);

        }


        const stop = () => {
            //stop interval if running
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
                intervalRef.current = null;
            }

            //stop microphone and audio references
            streamRefVad.current?.getTracks().forEach(track => track.stop());
            streamRefVad.current = null
            analyserRef.current = null
            audioCtxRef.current?.close().catch(() => {});
            audioCtxRef.current = null

            // reset vad state
            vadRef.current = {speaking: false, silenceCount: 0}

            setListening(false);

        }
        return {listening, start, stop}
    }

            const vad = useVad({
             onSpeechStart: () => {
              // reset stop timer if speech starts again
              if (stopTimerRef.current) {
                clearTimeout(stopTimerRef.current);
                stopTimerRef.current = null;
              }

              //start recording
              if (current?.question && !isTranscribing && !isTtsPlaying && !isRecording) {
                console.log("VAD started");
                startRecording();
              }
            },

                onSpeechEnd: () => {
                    console.log("Starting x second countdown of speech ending")
                    if (stopTimerRef.current) return

                    //wait to stop timer not to cut user off
                    stopTimerRef.current = setTimeout(() => {
                        console.log("Stopping recording")
                        stopRecording()
                        stopTimerRef.current = null;

                    }, 700);
                }
            });

            useEffect(() => {
                    const shouldRun = !!current?.question && !isTranscribing && !isTtsPlaying
                    console.log("VAD should run:")
                    if (shouldRun && !vad.listening) {
                        vad.start();
                    } else if (!shouldRun && vad.listening) {
                        vad.stop();
                    }

                }, [current?.question, isTtsPlaying, isTranscribing]
            );
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
                            disabled={autoSubmit}
                        />
                        <br/>
                        <button onClick={submitAnswer}>Submit Answer</button>



                        {autoPlayBlocked && (
                            <p style={{marginTop: 6}}>Your browser blocked autoplay</p>
                        )}
                        <div style={{marginTop: 10}}>
                            <p>Listening: {vad.listening ? "YES" : "no"}</p>
                            <p>Recording: {isRecording ? "YES" : "no"}</p>
                            <p>Transcribing: {isTranscribing ? "YES" : "no"}</p>
                            <p>TTS Playing: {isTtsPlaying ? "YES" : "no"}</p>
                        </div>

                        <div style={{marginTop: 10}}>
                            <label>
                                <input
                                    type="checkbox"
                                    checked={autoSubmit}
                                    onChange={(e) => setAutoSubmit(e.target.checked)}
                                />
                                Auto-submit after transcription
                            </label>
                        </div>

                        <div style={{marginTop: 10}}>
                            <button
                                type="button"
                                onClick={() => setShowBackupControls((v) => !v)}
                            >
                                {showBackupControls ? "Hide backup controls" : "Show backup controls"}
                            </button>

                            {showBackupControls && (
                                <div style={{marginTop: 8}}>
                                    {!isRecording && (
                                        <button
                                            type="button"
                                            onClick={startRecording}
                                            disabled={isTranscribing || isTtsPlaying}
                                        >
                                            Start recording (backup)
                                        </button>
                                    )}

                                    {isRecording && (
                                        <button type="button" onClick={stopRecording}>
                                            Stop recording (backup)
                                        </button>
                                    )}

                                    <button
                                        type="button"
                                        onClick={() => vad.start()}
                                        style={{marginLeft: 8}}
                                    >
                                        Start VAD (backup)
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => vad.stop()}
                                        style={{marginLeft: 8}}
                                    >
                                        Pause VAD (backup)
                                    </button>
                                    <button
                                    onClick={() => {
                                        const audio_file = audioRef.current;
                                        if (!audio_file) return;
                                        setIsTtsPlaying(true)

                                        audio_file.currentTime = 0;
                                        audio_file.play().catch(() => {
                                            // autoplay blocked — show message
                                            setAutoPlayBlocked(true);
                                            setIsTtsPlaying(false)
                                        });
                                    }}
                                >
                                    Play question audio
                                     </button>

                                </div>
                            )}
                        </div>
                    </div>
                </>
            )}
        </div>

    );

}
