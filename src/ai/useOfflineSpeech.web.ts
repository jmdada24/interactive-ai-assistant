export function useOfflineSpeech() {
  const startListening = async () => false;
  const stopAndTranscribe = async () => '';
  const cancelListening = async () => {};
  const requestPermission = async () => false;
  const prepareVoiceInput = () => false;

  return {
    isVoiceAvailable: false,
    isListening: false,
    isTranscribing: false,
    isReady: false,
    hasCheckedDownload: true,
    shouldLoadModel: false,
    downloadProgress: 0,
    error: null,
    prepareVoiceInput,
    requestPermission,
    startListening,
    stopAndTranscribe,
    cancelListening,
  };
}
