const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const cors = require('cors');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.static('public'));
app.use(express.json());

// Конфигурация
const CONFIG = {
    BASE_URL: 'https://a.flibusta.is',
    TIMEOUT: 30000,
    MAX_BOOKS: 10
};

// Создание заголовков для запросов
function getHeaders() {
    return {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7',
        'Accept-Encoding': 'gzip, deflate',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1'
    };
}

// Поиск книг
app.get('/api/search', async (req, res) => {
    try {
        const { query } = req.query;
        if (!query) {
            return res.status(400).json({ error: 'Query parameter is required' });
        }

        const searchUrl = `${CONFIG.BASE_URL}/booksearch?ask=${encodeURIComponent(query)}&chs=on&cha=on&chb=on`;
        console.log('Searching:', searchUrl);
        
        const response = await axios.get(searchUrl, {
            headers: getHeaders(),
            timeout: CONFIG.TIMEOUT
        });

        const $ = cheerio.load(response.data);
        const books = [];

        // Ищем заголовок с найденными книгами
        const h3Tag = $('h3:contains("Найденные книги")');
        if (h3Tag.length > 0) {
            const booksList = h3Tag.next('ul');
            if (booksList.length > 0) {
                booksList.find('li').each((index, element) => {
                    if (index >= CONFIG.MAX_BOOKS) return false;

                    const links = $(element).find('a');
                    if (links.length >= 2) {
                        const bookLink = $(links[0]);
                        const authorLink = $(links[links.length - 1]);
                        
                        const title = bookLink.text().trim();
                        const href = bookLink.attr('href');
                        const author = authorLink.text().trim();
                        
                        if (href && href.startsWith('/b/')) {
                            const bookId = href.replace('/b/', '');
                            books.push({
                                id: bookId,
                                title: title,
                                author: author
                            });
                        }
                    }
                });
            }
        }

        res.json(books);
    } catch (error) {
        console.error('Search error:', error.message);
        res.status(500).json({ error: 'Failed to search books' });
    }
});

// Получение ссылок на скачивание
app.get('/api/book/:id/formats', async (req, res) => {
    try {
        const { id } = req.params;
        const bookUrl = `${CONFIG.BASE_URL}/b/${id}`;
        
        const response = await axios.get(bookUrl, {
            headers: getHeaders(),
            timeout: CONFIG.TIMEOUT
        });

        const $ = cheerio.load(response.data);
        const formats = [];

        // Ищем ссылки на скачивание
        $('a[href^="/b/' + id + '/"]').each((index, element) => {
            const href = $(element).attr('href');
            const format = href.split('/').pop();
            
            if (format) {
                formats.push({
                    name: format.toUpperCase(),
                    url: `${CONFIG.BASE_URL}${href}`,
                    extension: format.toLowerCase()
                });
            }
        });

        // Сортируем по приоритету форматов
        const priority = ['fb2', 'epub', 'mobi', 'pdf', 'txt'];
        formats.sort((a, b) => {
            const indexA = priority.indexOf(a.extension);
            const indexB = priority.indexOf(b.extension);
            return (indexA === -1 ? 999 : indexA) - (indexB === -1 ? 999 : indexB);
        });

        res.json(formats);
    } catch (error) {
        console.error('Formats error:', error.message);
        res.status(500).json({ error: 'Failed to get book formats' });
    }
});

// Скачивание файла
app.get('/api/download', async (req, res) => {
    try {
        const { url, filename } = req.query;
        if (!url) {
            return res.status(400).json({ error: 'URL parameter is required' });
        }

        const response = await axios({
            method: 'GET',
            url: url,
            headers: getHeaders(),
            responseType: 'stream',
            timeout: CONFIG.TIMEOUT
        });

        // Устанавливаем заголовки для скачивания
        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename || 'book')}"`);
        res.setHeader('Content-Type', response.headers['content-type'] || 'application/octet-stream');

        // Передаем поток данных клиенту
        response.data.pipe(res);
    } catch (error) {
        console.error('Download error:', error.message);
        res.status(500).json({ error: 'Failed to download file' });
    }
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});