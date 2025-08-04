
import React, { useState, useCallback, useRef, useEffect } from 'react';
import { MessageInput } from './components/PromptInput';
import { CodeDisplay } from './components/CodeDisplay';
import { HeroSection } from './components/HeroSection';
import { FeaturesSection } from './components/FeaturesSection';
import { GuidedTour } from './components/GuidedTour';
import { SpeakerIcon } from './components/icons/SpeakerIcon';
import { SpeakerMuteIcon } from './components/icons/SpeakerMuteIcon';
import { InfoIcon } from './components/icons/InfoIcon';
import { SettingsIcon } from './components/icons/SettingsIcon';
import { AlertTriangleIcon } from './components/icons/AlertTriangleIcon';
import { Calendar } from './components/Calendar';
import { getAvailableSlots, bookAppointment } from './services/appointmentService';
import { streamAiResponse } from './services/geminiService';
import type { Message, VoiceStyle, AppointmentSlot } from './types';
import { FunctionCall } from '@google/genai';


// --- Zvuková spätná väzba ---
const startSoundB64 = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YSAAAAAMAAAA//8AAP/A//8EAA==";
const endSoundB64 = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YSAAAAAMAAAA//8AAP+AAAD/gf//BAA=";

export default function App(): React.ReactNode {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content: "Dobrý deň, volám sa Aurélia a som vaša virtuálna recepčná v klinike Dentista. Ako vám môžem pomôcť? Môžete sa ma pýtať na naše služby, alebo si dohodnúť termín."
    }
  ]);
  const [userInput, setUserInput] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [isTtsEnabled, setIsTtsEnabled] = useState<boolean>(true);
  const [isSpeaking, setIsSpeaking] = useState<boolean>(false);
  const [micSupported, setMicSupported] = useState<boolean>(true);
  const [isTourActive, setIsTourActive] = useState(false);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [needsTtsUnlock, setNeedsTtsUnlock] = useState(false);
  const [voiceStyle, setVoiceStyle] = useState<VoiceStyle>('professional');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [availableSlots, setAvailableSlots] = useState<AppointmentSlot[]>([]);


  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const lastSpokenMessageRef = useRef<string | null>(null);
  const chatSectionRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const micButtonRef = useRef<HTMLButtonElement>(null);
  const ttsButtonRef = useRef<HTMLButtonElement>(null);
  const settingsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // For demo, load slots for the current month on startup
    const now = new Date();
    setAvailableSlots(getAvailableSlots(now.getFullYear(), now.getMonth()));
  }, []);

  useEffect(() => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setMicSupported(false);
        console.warn("Nahrávanie zvuku nie je podporované v tomto prehliadači.");
    }
     if (typeof window === 'undefined' || !window.speechSynthesis) {
        console.warn("Syntéza reči nie je podporovaná v tomto prehliadači.");
        setIsTtsEnabled(false);
    }
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (settingsRef.current && !settingsRef.current.contains(event.target as Node)) {
        setIsSettingsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [settingsRef]);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;

    const loadVoices = () => {
      const availableVoices = window.speechSynthesis.getVoices();
      if (availableVoices.length > 0) {
        setVoices(availableVoices);
      }
    };
    
    window.speechSynthesis.onvoiceschanged = loadVoices;
    loadVoices();

    return () => {
      if (window.speechSynthesis) {
        window.speechSynthesis.onvoiceschanged = null;
      }
    };
  }, []);

  const playSound = useCallback((base64: string) => {
    try {
      if (!isTtsEnabled) return;
      const audio = new Audio(base64);
      audio.volume = 0.2;
      audio.play().catch(e => console.error("Chyba prehrávania zvuku:", e));
    } catch (e) {
      console.error("Chyba pri vytváraní zvuku:", e);
    }
  }, [isTtsEnabled]);

  const speak = useCallback((text: string) => {
    if (!isTtsEnabled || !text || text.trim() === '') return;

    setNeedsTtsUnlock(false);
    setError(null);

    if (window.speechSynthesis.speaking) {
      window.speechSynthesis.cancel();
    }
    
    const utterance = new SpeechSynthesisUtterance(text);

    const findBestVoice = (lang: string, preferredKeywords: string[]): SpeechSynthesisVoice | null => {
        const langVoices = voices.filter(v => v.lang === lang);
        if (langVoices.length === 0) return null;
        for (const keyword of preferredKeywords) {
            const premiumVoice = langVoices.find(v => v.name.toLowerCase().includes(keyword.toLowerCase()));
            if (premiumVoice) return premiumVoice;
        }
        return langVoices[0];
    };

    const preferredKeywords = ['google', 'microsoft', 'zuzana', 'laura', 'filip', 'neural', 'wave'];
    let bestVoice = findBestVoice('sk-SK', preferredKeywords);
    
    if (bestVoice) {
        utterance.voice = bestVoice;
        utterance.lang = 'sk-SK';
    } else {
        console.warn("Nenašiel sa preferovaný slovenský hlas. Hľadám záložný český hlas.");
        bestVoice = findBestVoice('cs-CZ', preferredKeywords);
        if (bestVoice) {
            utterance.voice = bestVoice;
            utterance.lang = 'cs-CZ';
        } else {
            utterance.lang = 'sk-SK';
            if (voices.length > 0) {
                 console.warn("Nenašiel sa žiadny slovenský ('sk-SK') ani český ('cs-CZ') hlas. Použije sa predvolený hlas prehliadača.");
            }
        }
    }

    utterance.rate = 0.95;
    utterance.pitch = 1.0;

    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = (event) => {
      setIsSpeaking(false);
      if (event.error === 'interrupted') {
        console.log("Syntéza reči bola prerušená, pravdepodobne novou požiadavkou na reč.");
        return;
      }
      
      if (event.error === 'not-allowed') {
        console.warn(`Automatické prehrávanie bolo zablokované prehliadačom (chyba: "${event.error}"). Vyžaduje sa interakcia používateľa.`);
        setNeedsTtsUnlock(true);
      } else {
        console.error("Chyba pri syntéze reči v prehliadači:", event.error);
        setError("Nastala chyba pri pokuse o prehratie hlasovej odpovede.");
      }
    };

    window.speechSynthesis.speak(utterance);
  }, [isTtsEnabled, voices, setNeedsTtsUnlock, setError]);


  useEffect(() => {
    if (!isTtsEnabled || needsTtsUnlock) {
      if (window.speechSynthesis.speaking) {
        window.speechSynthesis.cancel();
        setIsSpeaking(false);
      }
      return;
    };

    if (messages.length > 0) {
      const lastMessage = messages[messages.length - 1];
      if (lastMessage.role === 'assistant' && lastMessage.content && !isLoading && lastMessage.content !== lastSpokenMessageRef.current) {
        speak(lastMessage.content);
        lastSpokenMessageRef.current = lastMessage.content;
      }
    }
  }, [messages, speak, isTtsEnabled, isLoading, needsTtsUnlock]);


  const processStream = useCallback(async (stream: AsyncGenerator<any>, currentMessages: Message[]) => {
      for await (const chunk of stream) {
        setMessages(prevMessages => {
          const newMessages = [...prevMessages];
          const lastMessage = newMessages[newMessages.length - 1];

          if (lastMessage.role === 'assistant') {
             if (chunk.type === 'text') {
              lastMessage.content += chunk.content;
            } else if (chunk.type === 'sources') {
              if (!lastMessage.sources) {
                  lastMessage.sources = [];
              }
              lastMessage.sources.push(...chunk.content);
            } else if (chunk.type === 'tool_call') {
                const toolCall = chunk.content as FunctionCall;
                if(toolCall.name === 'show_booking_calendar') {
                    setIsCalendarOpen(true);
                }
            }
          }
          return newMessages;
        });
      }
  }, [setMessages, setIsCalendarOpen]);


  const handleSendMessage = useCallback(async (
    text: string | null, 
    audio?: { base64: string; mimeType: string },
    toolResponse?: Message
    ) => {
    const textToSend = text ? text.trim() : null;
    if (!textToSend && !audio && !toolResponse) return;

    let currentMessages = [...messages];
    
    if(!toolResponse) {
        const contentForUi = textToSend || (audio ? "[Hlasová správa]" : "");
        const newUserMessage: Message = { role: 'user', content: contentForUi };
        currentMessages.push(newUserMessage);
    }
    if(toolResponse) {
        currentMessages.push(toolResponse);
    }

    const assistantPlaceholderMessage: Message = { role: 'assistant', content: '', sources: [] };
    currentMessages.push(assistantPlaceholderMessage);
    setMessages(currentMessages);
    
    setUserInput('');
    setIsLoading(true);
    playSound(startSoundB64);
    setError(null);
    setNeedsTtsUnlock(false);
    
    try {
      const stream = streamAiResponse(messages, text, voiceStyle, audio);
      await processStream(stream, currentMessages);
      playSound(endSoundB64);
    } catch (e) {
      console.error(e);
      const errorMessage = e instanceof Error ? e.message : String(e);
      setError(`Prepáčte, nastala chyba: ${errorMessage}`);
      const errorResponseMessage: Message = { role: 'assistant', content: `Ospravedlňujem sa, ale nastala technická chyba. Skúste to prosím znova o chvíľu.` };
      setMessages(prevMessages => {
          const newMessages = [...prevMessages];
          newMessages[newMessages.length - 1] = errorResponseMessage;
          return newMessages;
      });
    } finally {
        setIsLoading(false);
    }
  }, [userInput, messages, playSound, voiceStyle, processStream]);

  const handleStartRecording = async () => {
    if (!micSupported) {
        setError("Nahrávanie zvuku nie je v tomto prehliadači podporované alebo povolené.");
        return;
    }
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/ogg;codecs=opus';
        mediaRecorderRef.current = new MediaRecorder(stream, { mimeType });
        audioChunksRef.current = [];
        mediaRecorderRef.current.ondataavailable = (event) => audioChunksRef.current.push(event.data);
        mediaRecorderRef.current.onstop = () => {
            const finalMimeType = mediaRecorderRef.current?.mimeType || mimeType;
            const audioBlob = new Blob(audioChunksRef.current, { type: finalMimeType });
            const reader = new FileReader();
            reader.readAsDataURL(audioBlob);
            reader.onloadend = () => {
                const base64String = reader.result?.toString().split(',')[1];
                if (base64String) {
                    handleSendMessage(null, { base64: base64String, mimeType: finalMimeType });
                }
            };
            stream.getTracks().forEach(track => track.stop());
        };
        mediaRecorderRef.current.start();
        setIsRecording(true);
    } catch (err) {
        console.error("Error accessing microphone:", err);
        setError("Nepodarilo sa získať prístup k mikrofónu. Povoľte ho prosím v nastaveniach prehliadača.");
    }
  };

  const handleStopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const handleToggleRecording = () => isRecording ? handleStopRecording() : handleStartRecording();

  const handleToggleTts = () => {
    const newState = !isTtsEnabled;
    setIsTtsEnabled(newState);
    if (!newState && window.speechSynthesis.speaking) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
    }
    if (newState) {
      setError(null);
    }
  };

  const getTtsButtonTitle = () => {
    return isTtsEnabled 
      ? "Vypnúť hlasový výstup" 
      : "Zapnúť hlasový výstup";
  };
  
  const handleConfirmBooking = async (dateTime: Date) => {
    setIsCalendarOpen(false);
    const bookingResult = await bookAppointment(dateTime);
    
    const locale = 'sk-SK';
    const formattedDate = dateTime.toLocaleDateString(locale, { day: '2-digit', month: '2-digit', year: 'numeric' });
    const formattedTime = dateTime.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });

    const toolResponseMessage: Message = {
      role: 'tool',
      content: JSON.stringify({
          name: 'show_booking_calendar',
          success: bookingResult.success,
          message: `Používateľ vybral termín: ${formattedDate} o ${formattedTime}. ID rezervácie: ${bookingResult.appointmentId}`
      })
    };
    
    // Visually add the user's choice to the chat
    const userChoiceMessage: Message = {
        role: 'tool',
        content: `Vybraný termín: ${formattedDate} o ${formattedTime}`
    };
    setMessages(prev => [...prev, userChoiceMessage]);
    
    // Now call the AI with the tool result to get a confirmation
    await handleSendMessage(null, undefined, toolResponseMessage);
  };

  const tourSteps = [
    { targetRef: inputRef, text: "Sem môžete napísať svoju požiadavku alebo otázku." },
    { targetRef: micButtonRef, text: "Podržte toto tlačidlo pre nahratie hlasovej správy." },
    { targetRef: ttsButtonRef, text: "Týmto tlačidlom môžete zapnúť alebo vypnúť hlasovú odpoveď asistentky." }
  ];

  const handleStyleChange = (style: VoiceStyle) => {
    setVoiceStyle(style);
    setIsSettingsOpen(false);
  }

  return (
    <div className="flex-grow flex flex-col">
      <HeroSection onCTAClick={() => chatSectionRef.current?.scrollIntoView({ behavior: 'smooth' })} />
      <FeaturesSection />

      <main ref={chatSectionRef} id="chat-section" className="w-full bg-transparent py-12 sm:py-16 md:py-20">
        <div className="w-full max-w-3xl mx-auto flex flex-col p-4">
          <header className="flex items-center justify-between gap-4 mb-6 flex-wrap">
            <h2 className="text-3xl sm:text-4xl font-bold text-emerald-100 dark:text-emerald-900 tracking-tight">
              Vyskúšajte ma naživo
            </h2>
            <div className="flex items-center justify-end gap-2 relative" ref={settingsRef}>
               <button 
                onClick={handleToggleTts}
                ref={ttsButtonRef}
                className="p-2 rounded-full text-emerald-400 dark:text-emerald-600 hover:bg-emerald-500/10 transition-colors"
                aria-label={isTtsEnabled ? "Vypnúť hlasový výstup" : "Zapnúť hlasový výstup"}
                title={getTtsButtonTitle()}
              >
                {isTtsEnabled ? <SpeakerIcon className="w-6 h-6" /> : <SpeakerMuteIcon className="w-6 h-6" />}
              </button>
               <button 
                onClick={() => setIsSettingsOpen(prev => !prev)}
                className="p-2 rounded-full text-emerald-400 dark:text-emerald-600 hover:bg-emerald-500/10 transition-colors"
                aria-label="Nastavenia hlasu"
                title="Nastavenia hlasu"
              >
                <SettingsIcon className="w-6 h-6" />
              </button>
               <button 
                onClick={() => setIsTourActive(true)}
                className="p-2 rounded-full text-emerald-400 dark:text-emerald-600 hover:bg-emerald-500/10 transition-colors"
                aria-label="Ukáž mi, ako to funguje"
                title="Ukáž mi, ako to funguje"
              >
                <InfoIcon className="w-6 h-6" />
              </button>
              {isSettingsOpen && (
                <div className="absolute top-full right-0 mt-2 w-64 bg-gray-800/80 dark:bg-white/80 backdrop-blur-lg border border-gray-700/50 dark:border-white/30 rounded-lg shadow-2xl z-10 p-4">
                    <p className="font-semibold text-sm text-gray-200 dark:text-gray-800 mb-3">Štýl Hlasu</p>
                    <div className="space-y-2">
                        {(['professional', 'friendly', 'concise'] as VoiceStyle[]).map(style => (
                            <label key={style} className="flex items-center gap-3 p-2 rounded-md hover:bg-emerald-500/10 cursor-pointer">
                                <input 
                                    type="radio"
                                    name="voice-style"
                                    value={style}
                                    checked={voiceStyle === style}
                                    onChange={() => handleStyleChange(style)}
                                    className="w-4 h-4 accent-emerald-600"
                                />
                                <span className="text-sm text-gray-300 dark:text-gray-700 capitalize">{
                                    {professional: 'Profesionálny', friendly: 'Prívetivý', concise: 'Stručný'}[style]
                                }</span>
                            </label>
                        ))}
                    </div>
                </div>
              )}
            </div>
          </header>

          <div className="flex-grow flex flex-col bg-gray-800/50 dark:bg-white/70 backdrop-blur-xl border border-gray-700/50 dark:border-white/30 rounded-2xl shadow-2xl shadow-black/20 dark:shadow-gray-500/10 overflow-hidden h-[60vh] sm:h-[70vh]">
            <CodeDisplay
              messages={messages}
              isLoading={isLoading}
              isSpeaking={isSpeaking}
              needsTtsUnlock={needsTtsUnlock}
              onManualSpeak={speak}
            />
            <div className="p-4 bg-gray-800/40 dark:bg-white/50 backdrop-blur-xl border-t border-gray-700/50 dark:border-white/30">
              <MessageInput
                userInput={userInput}
                setUserInput={setUserInput}
                onSendMessage={() => handleSendMessage(userInput)}
                isLoading={isLoading}
                isRecording={isRecording}
                onToggleRecording={handleToggleRecording}
                micSupported={micSupported}
                inputRef={inputRef}
                micButtonRef={micButtonRef}
              />
               {error && (
                <div className="mt-3 p-3 bg-red-500/20 backdrop-blur-md border border-red-500/30 rounded-lg flex items-start gap-3">
                  <div className="flex-shrink-0 pt-0.5">
                    <AlertTriangleIcon className="w-5 h-5 text-red-200 dark:text-red-800" />
                  </div>
                  <p className="flex-grow text-sm text-red-100 dark:text-red-900">
                    {error}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
      
      <footer className="w-full py-6 bg-transparent text-gray-400 dark:text-gray-600 text-xs">
        <div className="max-w-5xl mx-auto px-4 flex flex-col sm:flex-row justify-between items-center gap-4">
            <p className="text-center sm:text-left">Powered by Gemini AI | Design by a World-Class Senior Frontend Engineer</p>
            <div className="flex items-center gap-2 group relative">
                <span className="font-medium text-gray-300 dark:text-gray-700">API Key:</span>
                <span className="px-2 py-1 bg-white/10 dark:bg-gray-900/10 text-gray-200 dark:text-gray-800 rounded text-xs font-mono select-none backdrop-blur-sm">Loaded from environment</span>
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-72 p-3 bg-white/80 text-gray-900 text-xs rounded-lg shadow-xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none backdrop-blur-md border border-black/10">
                    For security, the Google API key is loaded from an `API_KEY` environment variable and cannot be configured in the browser.
                    <svg className="absolute text-white/80 h-2 w-full left-0 top-full" x="0px" y="0px" viewBox="0 0 255 255">
                        <polygon className="fill-current" points="0,0 127.5,127.5 255,0"/>
                    </svg>
                </div>
            </div>
        </div>
      </footer>
      
      {isTourActive && <GuidedTour steps={tourSteps} onClose={() => setIsTourActive(false)} />}

      {isCalendarOpen && (
        <Calendar 
            availableSlots={availableSlots}
            onClose={() => setIsCalendarOpen(false)}
            onBookAppointment={handleConfirmBooking}
            onMonthChange={(year, month) => setAvailableSlots(getAvailableSlots(year, month))}
        />
      )}
    </div>
  );
}