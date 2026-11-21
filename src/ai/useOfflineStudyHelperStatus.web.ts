export function useOfflineStudyHelperStatus() {
  return {
    isAvailable: false,
    isChecking: false,
    isSearchReady: false,
    isReady: false,
    isLoading: false,
    progress: 0,
    error: null,
    statusMessage: 'The study helper is unavailable in this preview.',
    failureDetail: null,
    recoveryMessage: null,
    deviceWarning: null,
    startDownload: async () => false,
  };
}
