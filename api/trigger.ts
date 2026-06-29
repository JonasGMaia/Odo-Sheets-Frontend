    import type { VercelRequest, VercelResponse } from '@vercel/node';

    export default async function handler(req: VercelRequest, res: VercelResponse) {
    try {
        const githubRepo = 'JonasGMaia/Odo-Sheets'; 
        
        const response = await fetch(`https://api.github.com/repos/${githubRepo}/actions/workflows/scraper.yml/dispatches`, {
        method: 'POST',
        headers: {
            'Accept': 'application/vnd.github.v3+json',
            // 'Bearer' é o padrão atual da web, o GitHub aceita ambos (token/Bearer)
            'Authorization': `Bearer ${process.env.GITHUB_TOKEN}` ,
            'X-GitHub-Api-Version': '2022-11-28',
            'User-Agent': 'Odo-Sheets-App'
        },
        body: JSON.stringify({ ref: 'main' })
        });

        if (response.ok) {
        res.status(200).json({ success: true, message: 'Robô acordado!' });
        } else {
        const errorText = await response.text();
        res.status(response.status).json({ success: false, error: errorText });
        }
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
    }