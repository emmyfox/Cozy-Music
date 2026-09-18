async function playNext(guildId) {
    const musicData = music.get(guildId);

    if (!musicData || musicData.stopped) {
        return;
    }

    if (musicData.queue.length === 0) {
        const files = fs.readdirSync(MUSIC_DIR).filter(file => file.endsWith('.mp3') || file.endsWith('.wav'));
        
        if (files.length === 0) {
            console.log(`[${guildId}] No audio files found in the root directory!`);
            return;
        }

        musicData.queue = files.map(file => path.join(MUSIC_DIR, file));
        console.log(`[${guildId}] Playlist looped. Reloaded ${musicData.queue.length} tracks.`);
    }

    const filePath = musicData.queue.shift();
    musicData.currentTrack = path.basename(filePath);

    try {
        console.log(`[${guildId}] Now Playing: ${musicData.currentTrack}`);

        // Force stream creation with explicit fallback to avoid missing module crashes
        const resource = createAudioResource(filePath, {
            inlineVolume: true,
            inputType: 0 // Automatically detect audio type
        });
        
        resource.volume.setVolume(1.0);
        musicData.player.play(resource);

    } catch (error) {
        console.error(`[${guildId}] Error playing ${musicData.currentTrack}:`, error.message);
        await playNext(guildId);
    }
}