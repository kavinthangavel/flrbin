import xss from 'xss';

import { Marked } from 'marked';
import { CloudflareEnv, getEnv } from './env';
import { Router } from './router';
import { Paste, createStorage } from './storage';
import { handleScheduled } from './cron';
import {
  deletePage,
  editPage,
  errorPage,
  guidePage,
  homePage,
  pastePage,
} from './templates';

interface TocItem {
  level: number;
  text: string;
  anchor: string;
  subitems: TocItem[];
}

const MIMES: Record<string, string> = {
  'js': 'text/javascript',
  'css': 'text/css',
  'ico': 'image/vnd.microsoft.icon',
};

const XSS_OPTIONS = {
  whiteList: {
    h1: ['id'],
    h2: ['id'],
    h3: ['id'],
    h4: ['id'],
    h5: ['id'],
    h6: ['id'],
    input: ['disabled', 'type', 'checked'],
  },
};

function createParser() {
  const tocItems: TocItem[] = [];

  const renderer = {
    heading(text: string, level: number) {
      const anchor = createSlug(text);
      const newItem = { level, text, anchor, subitems: [] };

      tocItems.push(newItem);
      return `<h${level} id="${anchor}"><a href="#${anchor}">${text}</a></h${level}>`;
    },
  };

  const marked = new Marked({ renderer, breaks: true });
  const parse = (markdown: string, { toc = true } = {}) => {
    let html = marked.parse(markdown) as string;
    const title = tocItems[0] ? tocItems[0].text : '';

    if (toc) {
      const tocHtml = buildToc(tocItems);
      if (tocHtml) html = html.replace(/\[\[\[TOC\]\]\]/g, tocHtml);
    }

    return { title, html };
  };

  return parse;
}

function createSlug(text = '') {
  const lines = text.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const slug = lines[i].toString().toLowerCase()
      .replace(/\s+/g, '-') // Replace spaces with -
      .replace(/[^\w\-]+/g, '') // Remove all non-word chars
      .replace(/\-\-+/g, '-') // Replace multiple - with single -
      .replace(/^-+/, '') // Trim - from start of text
      .replace(/-+$/, ''); // Trim - from end of text

    if (slug.length > 0) return slug;
  }

  return '';
}

function uid() {
  // https://github.com/lukeed/uid
  // MIT License
  // Copyright (c) Luke Edwards <luke.edwards05@gmail.com> (lukeed.com)
  let IDX = 36, HEX = '';
  while (IDX--) HEX += IDX.toString(36);

  return () => {
    let str = '', num = 6;
    while (num--) str += HEX[Math.random() * 36 | 0];
    return str;
  };
}

function buildToc(items: TocItem[] = []) {
  let html = '';

  while (items.length > 0) {
    html += buildNestedList(items, 1);
  }

  return html ? `<div class="toc">${html}</div>` : html;
}

function buildNestedList(items: TocItem[] = [], level: number) {
  let html = '<ul>';

  while (items.length > 0 && items[0].level === level) {
    const item = items.shift();
    if (item) html += `<li><a href="#${item.anchor}">${item.text}</a></li>`;
  }

  while (items.length > 0 && items[0].level > level) {
    html += buildNestedList(items, level + 1);
  }

  return html + '</ul>';
}

export default {
  async fetch(request: Request, env: CloudflareEnv, ctx: any): Promise<Response> {

    const { MODE, DEMO_CLEAR_INTERVAL, KV } = getEnv(env);
    const storage = createStorage(KV);
    const generateId = uid();
    const app = new Router();

    app.get('/', () => {
      return new Response(homePage({ mode: MODE }), {
        status: 200,
        headers: { 'content-type': 'text/html' },
      });
    });

    app.get('/guide', async (req) => {
      const guideMd = await fetch(new URL('/guide.md', req.url)).then(res => res.text());
      const parse = createParser();
      const { html, title } = parse(guideMd);

      return new Response(guidePage({ html, title, mode: MODE }), {
        status: 200,
        headers: { 'content-type': 'text/html' },
      });
    });

    app.get('/:id', async (_req, params) => {
      let contents = '';
      let status = 200;
      const id = params.id as string ?? '';
      const res = await storage.get(id);

      if (res.value !== null) {
        const { paste } = res.value;
        const parse = createParser();
        let { html, title } = parse(paste);
        html = xss(html, XSS_OPTIONS);
        if (!title) title = id;

        contents = pastePage({ id, html, title, mode: MODE });
        status = 200;
      } else {
        contents = errorPage(MODE);
        status = 404;
      }

      return new Response(contents, {
        status,
        headers: {
          'content-type': 'text/html',
        },
      });
    });

    app.get('/:id/edit', async (_req, params) => {
      let contents = '';
      let status = 200;
      const id = params.id as string ?? '';
      const res = await storage.get(id);

      if (res.value !== null) {
        const { editCode, paste } = res.value;
        const hasEditCode = Boolean(editCode);
        contents = editPage({ id, paste, hasEditCode, mode: MODE });
        status = 200;
      } else {
        contents = errorPage(MODE);
        status = 404;
      }

      return new Response(contents, {
        status,
        headers: {
          'content-type': 'text/html',
        },
      });
    });

    app.get('/:id/delete', async (_req, params) => {
      let contents = '';
      let status = 200;

      const id = params.id as string ?? '';
      const res = await storage.get(id);

      if (res.value !== null) {
        const { editCode } = res.value;
        const hasEditCode = Boolean(editCode);
        contents = deletePage({ id, hasEditCode, mode: MODE });
      } else {
        contents = errorPage(MODE);
        status = 404;
      }

      return new Response(contents, {
        status,
        headers: {
          'content-type': 'text/html',
        },
      });
    });

    app.get('/:id/raw', async (_req, params) => {
      let contents = '';
      let status = 200;
      let contentType = 'text/plain';
      const id = params.id as string ?? '';
      const res = await storage.get(id);

      if (res.value !== null) {
        const { paste } = res.value;
        contents = paste;
        status = 200;
      } else {
        contents = errorPage(MODE);
        status = 404;
        contentType = 'text/html';
      }

      return new Response(contents, {
        status,
        headers: {
          'content-type': contentType,
        },
      });
    });

    app.post('/save', async (req) => {
      let status = 302;
      let contents = '';
      const headers = new Headers({
        'content-type': 'text/html',
      });

      const form = await req.formData();
      const customUrl = form.get('url') as string;
      const paste = form.get('paste') as string;
      const slug = createSlug(customUrl);

      let editCode: string | undefined = form.get('editcode') as string;
      if (typeof editCode === 'string') {
        editCode = editCode.trim() || undefined;
      }

      if (slug.length > 0) {
        const res = await storage.get(slug);

        if (slug === 'guide' || res.value !== null) {
          status = 422;

          contents = homePage({
            paste,
            url: customUrl,
            errors: { url: `url unavailable: ${customUrl}` },
            mode: MODE,
          });
        } else {
          await storage.set(slug, { paste, editCode });
          status = 302;
          headers.set('location', '/' + slug.trim());
        }
      } else {
        let id = '';
        let exists = true;

        for (; exists;) {
          id = generateId();
          exists = await storage.get(id).then(
            (r) => r.value !== null,
          );
        }

        await storage.set(id, { paste, editCode });
        status = 302;
        headers.set('location', '/' + id.trim());
      }

      return new Response(contents, {
        status,
        headers,
      });
    });

    app.post('/:id/save', async (req, params) => {
      let contents = '302';
      let status = 302;

      const id = params.id as string ?? '';
      const form = await req.formData();
      const paste = form.get('paste') as string;
      let editCode: string | undefined = form.get('editcode') as string;
      if (typeof editCode === 'string') {
        editCode = editCode.trim() || undefined;
      }

      const headers = new Headers({
        'content-type': 'text/html',
      });

      if (id.trim().length === 0) {
        headers.set('location', '/');
      } else {
        const res = await storage.get(id);
        const existing = res.value as Paste;
        const hasEditCode = Boolean(existing.editCode);

        if (
          hasEditCode &&
          existing.editCode !== editCode
        ) {
          // editCode mismatch
          status = 400;
          contents = editPage({
            id,
            paste,
            hasEditCode,
            errors: { editCode: 'invalid edit code' },
            mode: MODE,
          });
        } else {
          await storage.set(id, { ...existing, paste });
          headers.set('location', '/' + id);
        }
      }

      return new Response(contents, {
        status,
        headers,
      });
    });

    app.post('/:id/delete', async (req, params) => {
      let contents = '302';
      let status = 302;
      const headers = new Headers({
        'content-type': 'text/html',
      });

      const id = params.id as string ?? '';
      const form = await req.formData();
      let editCode: string | undefined = form.get('editcode') as string;
      if (typeof editCode === 'string') {
        editCode = editCode.trim() || undefined;
      }

      if (id.trim().length === 0) {
        headers.set('location', '/');
      } else {
        const res = await storage.get(id);
        const existing = res.value as Paste;
        const hasEditCode = Boolean(existing.editCode);

        if (
          hasEditCode &&
          existing.editCode !== editCode
        ) {
          // editCode mismatch
          status = 400;
          contents = deletePage({
            id,
            hasEditCode,
            errors: { editCode: 'invalid edit code' },
            mode: MODE,
          });
        } else {
          await storage.delete(id);
          headers.set('location', '/');
        }
      }

      return new Response(contents, {
        status,
        headers,
      });
    });

    return await app.handler(request);
  },

  async scheduled(event: any, env: CloudflareEnv, ctx: any): Promise<void> {
    return handleScheduled(event, env, ctx);
  },
};
