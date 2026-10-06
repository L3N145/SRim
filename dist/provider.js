export class ResourceProvider {
    lastFetchTime = 0;
    canFetch() {
        const isOnline = typeof navigator.onLine === 'boolean' ? navigator.onLine : true;
        const cooldownPassed = Date.now() - this.lastFetchTime > 1000 * 20; // 20秒間隔
        return isOnline && cooldownPassed;
    }
    async fetchImage(keyword) {
        if (!this.canFetch())
            return null;
        this.lastFetchTime = Date.now();
        try {
            let query = keyword;
            if (!query) {
                const randRes = await fetch('https://ja.wikipedia.org/w/api.php?action=query&list=random&rnnamespace=0&rnlimit=1&format=json&origin=*');
                const randData = await randRes.json();
                query = randData.query?.random?.[0]?.title;
            }
            if (!query)
                return null;
            const pageRes = await fetch(`https://ja.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(query)}&prop=pageimages&format=json&pithumbsize=300&origin=*`);
            const pageData = await pageRes.json();
            const pages = pageData.query?.pages;
            const pageId = Object.keys(pages || {})[0];
            const thumbUrl = pages?.[pageId]?.thumbnail?.source;
            if (thumbUrl) {
                return {
                    title: query,
                    imageUrl: thumbUrl,
                };
            }
        }
        catch {
            return null;
        }
        const fallbackIds = ['10', '28', '40', '106', '142', '164'];
        const id = fallbackIds[Math.floor(Math.random() * fallbackIds.length)];
        return {
            title: keyword || 'どこかの光景',
            imageUrl: `https://picsum.photos/id/${id}/200/200`,
        };
    }
}
