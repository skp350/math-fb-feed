const fs = require('fs');
const path = require('path');

const RSS_URL = 'https://fetchrss.com/feed/1x2Ksn3K62qo1x2KsG7fR4v4.rss';
const FB_PAGE_URL = 'https://www.facebook.com/MathMaeJo';
const IMG_DIR = 'images';

if (!fs.existsSync(IMG_DIR)) {
    fs.mkdirSync(IMG_DIR, { recursive: true });
}

// ฟังก์ชันแปลงลิงก์ให้เป็นของเพจ MathMaeJo ตั้งแต่ต้นทาง
function cleanFacebookUrl(rawUrl, postId) {
    if (!rawUrl) return FB_PAGE_URL;
    // แปลงรหัสตัวเลขยาวๆ เช่น /1576197564303377/posts/ ให้เป็นชื่อเพจ /MathMaeJo/posts/
    let fixed = rawUrl.replace(/facebook\.com\/\d+\/posts\//, 'facebook.com/MathMaeJo/posts/');
    if (postId && !fixed.includes('/posts/')) {
        fixed = `https://www.facebook.com/MathMaeJo/posts/${postId}`;
    }
    return fixed;
}

// ฟังก์ชันดาวน์โหลดรูปลงโฟลเดอร์ images/ (ลองตรงๆ ก่อน ถ้าโดนบล็อกให้ผ่าน wsrv.nl proxy)
async function downloadImage(url, filepath) {
    const urlsToTry = [
        url,
        'https://wsrv.nl/?url=' + encodeURIComponent(url) + '&output=jpg'
    ];

    for (const tryUrl of urlsToTry) {
        try {
            const res = await fetch(tryUrl, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
                    'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8'
                }
            });
            if (!res.ok) continue;

            const contentType = res.headers.get('content-type') || '';
            if (!contentType.includes('image')) continue;

            const buffer = Buffer.from(await res.arrayBuffer());
            if (buffer.length < 1500) continue; // ป้องกันไฟล์เสีย

            fs.writeFileSync(filepath, buffer);
            return true;
        } catch (e) {
            // ลอง URL สำรองถัดไป
        }
    }
    return false;
}

// แผนที่สำหรับ 5 โพสต์แรกสุดที่เคยใช้ชื่อ fb1.jpg - fb5.jpg
const legacyPostMap = {
    '1598529688736831': 'images/fb1.jpg',
    '1598529515403515': 'images/fb2.jpg',
    '1598529438736856': 'images/fb3.jpg',
    '1598529358736864': 'images/fb4.jpg',
    '1598529208736879': 'images/fb5.jpg'
};

async function run() {
    console.log('Checking FetchRSS for new Facebook posts...');
    const res = await fetch(RSS_URL);
    if (!res.ok) {
        console.log('RSS unreachable, keeping existing files.');
        return;
    }
    const xml = await res.text();

    const itemRegex = /<item>([\s\S]*?)<\/item>/g;
    const items = [...xml.matchAll(itemRegex)].slice(0, 5);

    if (items.length === 0) {
        console.log('No items in RSS, keeping existing files.');
        return;
    }

    const newPosts = [];

    for (let i = 0; i < items.length; i++) {
        const itemXml = items[i][1];
        const title = (itemXml.match(/<title>([\s\S]*?)<\/title>/)?.[1] || '').trim();
        const rawLink = (itemXml.match(/<link>([\s\S]*?)<\/link>/)?.[1] || FB_PAGE_URL).trim();
        const pubDate = (itemXml.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1] || '').trim();
        const guid = (itemXml.match(/<guid[^>]*>([\s\S]*?)<\/guid>/)?.[1] || '').trim();

        // สกัดรหัสโพสต์ (Post ID)
        const postIdMatch = rawLink.match(/posts\/(\d+)/) || guid.match(/_(\d+)/) || [null, `item_${i + 1}`];
        const postId = postIdMatch[1];

        // แปลงลิงก์ให้เป็นของเพจ MathMaeJo ที่ถูกต้อง
        const cleanLink = cleanFacebookUrl(rawLink, postId);

        let desc = itemXml.match(/<description>\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*<\/description>/)?.[1]
                || itemXml.match(/<description>([\s\S]*?)<\/description>/)?.[1] || '';

        let imgUrl = itemXml.match(/<media:content[^>]+url=["']([^"']+)["']/)?.[1]
                  || desc.match(/src=["']([^"']+)["']/)?.[1] || '';
        imgUrl = imgUrl.replace(/&amp;/g, '&').trim();

        let cleanText = desc
            .replace(/<span[\s\S]*?<\/span>/gi, '')
            .replace(/<[^>]+>/g, ' ')
            .replace(/\(Feed generated with FetchRSS\)/gi, '')
            .replace(/\s+/g, ' ')
            .trim();

        const localImgPath = path.join(IMG_DIR, `post_${postId}.jpg`);
        let finalThumbnail = `images/post_${postId}.jpg`;

        if (fs.existsSync(localImgPath)) {
            console.log(`Post ${postId}: Image already saved`);
        } else if (imgUrl && await downloadImage(imgUrl, localImgPath)) {
            console.log(`Post ${postId}: Downloaded new image -> ${localImgPath}`);
        } else if (legacyPostMap[postId] && fs.existsSync(legacyPostMap[postId])) {
            fs.copyFileSync(legacyPostMap[postId], localImgPath);
            console.log(`Post ${postId}: Mapped legacy image -> ${localImgPath}`);
        } else if (imgUrl) {
            finalThumbnail = imgUrl; // Fallback หากโหลดไม่สำเร็จจริงๆ
        }

        newPosts.push({
            id: postId,
            title: title || 'ข่าวสารสาขาวิชาคณิตศาสตร์',
            description: cleanText || title,
            pubDate: pubDate,
            thumbnail: finalThumbnail,
            liveImgUrl: imgUrl,
            link: cleanLink
        });
    }

    fs.writeFileSync('posts.json', JSON.stringify(newPosts, null, 2), 'utf8');
    console.log('Saved posts.json with clean mobile-ready Facebook URLs!');
}

run();
