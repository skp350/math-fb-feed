const fs = require('fs');
const path = require('path');

const RSS_URL = 'https://fetchrss.com/feed/1x2Ksn3K62qo1x2KsG7fR4v4.rss';
const FB_PAGE_URL = 'https://www.facebook.com/MathMaeJo';
const IMG_DIR = 'images';

// สร้างโฟลเดอร์ images/ หากรันครั้งแรก
if (!fs.existsSync(IMG_DIR)) {
    fs.mkdirSync(IMG_DIR, { recursive: true });
}

async function downloadImage(url, filepath) {
    try {
        const res = await fetch(url, {
            headers: { 'User-Agent': 'Mozilla/5.0' }
        });
        if (!res.ok) return false;
        const contentType = res.headers.get('content-type') || '';
        if (!contentType.includes('image')) return false;

        const buffer = Buffer.from(await res.arrayBuffer());
        if (buffer.length < 1000) return false;

        fs.writeFileSync(filepath, buffer);
        return true;
    } catch (e) {
        return false;
    }
}

async function run() {
    console.log('Checking FetchRSS for new Facebook posts...');
    const res = await fetch(RSS_URL);
    if (!res.ok) {
        console.log('RSS unreachable, keeping existing images in /images folder.');
        return;
    }
    const xml = await res.text();

    const itemRegex = /<item>([\s\S]*?)<\/item>/g;
    const items = [...xml.matchAll(itemRegex)].slice(0, 5);

    if (items.length === 0) {
        console.log('No items in RSS, keeping existing images.');
        return;
    }

    const newPosts = [];

    for (let i = 0; i < items.length; i++) {
        const itemXml = items[i][1];
        const title = (itemXml.match(/<title>([\s\S]*?)<\/title>/)?.[1] || '').trim();
        const link = (itemXml.match(/<link>([\s\S]*?)<\/link>/)?.[1] || FB_PAGE_URL).trim();
        const pubDate = (itemXml.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1] || '').trim();

        let desc = itemXml.match(/<description>\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*<\/description>/)?.[1]
            || itemXml.match(/<description>([\s\S]*?)<\/description>/)?.[1] || '';

        let imgUrl = itemXml.match(/<media:content[^>]+url=["']([^"']+)["']/)?.[1]
            || desc.match(/src=["']([^"']+)["']/)?.[1] || '';
        imgUrl = imgUrl.replace(/&amp;/g, '&');

        let cleanText = desc
            .replace(/<span[\s\S]*?<\/span>/gi, '')
            .replace(/<[^>]+>/g, ' ')
            .replace(/\(Feed generated with FetchRSS\)/gi, '')
            .replace(/\s+/g, ' ')
            .trim();

        const localImgPath = path.join(IMG_DIR, `fb${i + 1}.jpg`);

        // ดาวน์โหลดรูปเก็บเข้าโฟลเดอร์ images/ (ถ้าลิงก์ RSS หมดอายุ จะไม่ทับรูปเดิมในโฟลเดอร์!)
        if (imgUrl) {
            const success = await downloadImage(imgUrl, localImgPath);
            console.log(`Post ${i + 1}: ${success ? 'Saved new image to ' + localImgPath : 'RSS link expired -> keeping saved image in ' + localImgPath}`);
        }

        newPosts.push({
            title: title || 'ข่าวสารสาขาวิชาคณิตศาสตร์',
            description: cleanText || title,
            pubDate: pubDate,
            thumbnail: `images/fb${i + 1}.jpg`,
            link: link
        });
    }

    fs.writeFileSync('posts.json', JSON.stringify(newPosts, null, 2), 'utf8');
    console.log('Updated posts.json successfully!');
}

run();