// Fish Audio API Configuration
const CONFIG = {
    FISH_AUDIO_API_KEY: 'e216cf13d15d4dfa9072558b9c6c9a3e',
    FISH_AUDIO_BASE_URL: 'https://api.fish.audio/v1',

    // Voice reference IDs for male/female voices
    VOICE_REFERENCES: {
        female: 'b089032e45db460fb1934ece75a8c51d', // Hot and Sexy Female - professional, clear English
        male: '7d4e8a6444a442eb819c69981fdb8315'   // Tech Male - American, confident, professional
    },

    // Emotion to voice parameter mapping (speed modulation only)
    EMOTION_VOICE_PARAMS: {
        happy: {
            speed: 1.3         // Much faster for excitement/cheerfulness
        },
        sad: {
            speed: 0.7         // Much slower for sadness/melancholy
        },
        neutral: {
            speed: 1.0         // Normal pace
        },
        surprised: {
            speed: 1.5         // Very fast for surprise/excitement
        },
        angry: {
            speed: 1.2         // Faster with intensity
        }
    }
};
