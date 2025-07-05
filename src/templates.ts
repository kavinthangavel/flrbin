import { CloudflareEnv } from './env';

const _if = (condition: unknown, template: string) => (
  condition ? template : ''
);

const Tabs = () => `
  <input type="radio" name="tabs" id="tab1" class="tab-input" checked />
  <label class="tab" for="tab1">editor</label>
  <input type="radio" name="tabs" id="tab2" class="tab-input" />
  <label class="tab" for="tab2">preview</label>
  <small id="characterCount"></small>
`;

const Editor = (paste = '') => `
  <div id="editor-container">
    <textarea id="pasteTextArea" name="paste" required>${paste}</textarea>
    <div id="editor"></div>
  </div>

  <div id="preview-container">
  </div>
`;

const layout = (title: string, content: string, mode?: string) => `
  <!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="X-UA-Compatible" content="ie=edge">
    <meta name="description" content="pastebin" >
    <link rel="icon" type="image/x-icon" href="/favicon.ico">
    <link rel="shortcut icon" type="image/x-icon" href="/favicon.ico">
    <link rel="stylesheet" href="/codemirror.min.css">
    <link rel="stylesheet" href="/main.css">
    <title>
      ${title || 'flrbin'}
    </title>
  </head>
  <body>
    <div class="dark-mode-container">
      <input style="display: none;" type="checkbox" id="darkSwitch" />
      <label class="dark-mode-btn" for="darkSwitch">🌒</label>
    </div>

    ${_if(mode === 'demo', `
      <div role="alert" class="demo-alert">
        <strong style="font-size: 2em">
          <p>This is a DEMO instance.</p>
          <p>Posts will be automatically deleted every few minutes.</p>
        </strong>
      </div>
    `)}

    ${content}
    <footer>
      <hr />
      <div class="footer-links">
        <a href="/">new</a>
        <a href="/guide">guide</a>
        <a href="https://github.com/kvnlabs/flrbin">source</a>
      </div>
    </footer>
    <script src="/theme-switch.js"></script>
  </body>
  </html>
`;

export const homePage = ({
  paste = '',
  url = '',
  errors = { url: '' },
  mode = '',
} = {}) => layout('flrbin', `
  <main>
    ${Tabs()}

    <form id="editor-form" method="post" action="/save">
      ${Editor(paste)}

      <div class="input-group">
        <div>
          <input
            name="url"
            type="text"
            placeholder="custom url"
            minlength="3"
            maxlength="40"
            value="${url}"
            pattern=".*\\S+.*"
            aria-invalid="${Boolean(errors.url)}"
            ${_if(errors.url, 'aria-describedby="url-error"')}
          />
          ${_if(errors.url, `
            <small class="error" id="url-error">${errors.url}</small>
          `)}
        </div>
        <div>
          <input
            name="editcode"
            type="text"
            placeholder="edit code (optional)"
            minlength="3"
            maxlength="40"
          />
        </div>
      </div>

      <div class="button-group">
        <button type="submit">
          save
        </button>
      </div>
    </form>
  </main>
  <script src="/marked.min.js"></script>
  <script src="/codemirror.min.js"></script>
  <script src="/cm-markdown.min.js"></script>
  <script src="/cm-sublime.min.js"></script>
  <script src="/editor.js"></script>
`, mode);

import { PasteRevision } from './storage';

export const pastePage = ({ id = '', html = '', title = '', mode = '', revisions = [] }: { id?: string; html?: string; title?: string; mode?: string; revisions?: PasteRevision[] } = {}) => layout(title, `
  <main>
    <div class="paste-container">
      ${html}
    </div>
    <div class="button-group">
      <a class="btn" href="/${id}/raw">raw</a>
      <a class="btn" href="/${id}/edit">edit</a>
      <a class="btn" href="/${id}/delete">delete</a>
    </div>
    ${_if(revisions.length > 0, `
      <div class="revision-history">
        <h3>Revision History</h3>
        <ul>
          ${revisions.map(rev => `
            <li>
              <a href="/${id}/edit?revision=${rev.timestamp}">
                ${new Date(rev.timestamp).toLocaleString()}
              </a>
            </li>
          `).join('')}
        </ul>
      </div>
    `)}
  </main>
`, mode);

export const guidePage = ({ html = '', title = '', mode = '' } = {}) => layout(title, `
  <main>
    <div class="paste-container">
      ${html}
    </div>
  </main>
`, mode);

export const editPage = (
  { id = '', paste = '', hasEditCode = false, errors = { editCode: '' }, mode = '' } = {},
) => layout(`edit ${id}`, `
  <main>
    ${Tabs()}

    <form id="editor-form" method="post" action="/${id}/save">
      ${Editor(paste)}

      <input class="display-none" name="url" type="text" value="${id}" disabled />
      <div class="input-group">
        ${_if(hasEditCode, `
          <div>
            <input
              name="editcode"
              type="text"
              placeholder="edit code"
              minlength="3"
              maxlength="40"
              required
              aria-invalid="${Boolean(errors.editCode)}"
              ${_if(errors.editCode, 'aria-describedby="editcode-error"')}
            />

            ${_if(errors.editCode, `
              <small class="error" id="editcode-error">${errors.editCode}</small>
            `)}
          </div>
        `)}
      </div>

      <div class="button-group">
        <button type="submit">
          save
        </button>
      </div>
    </form>
  </main>
  <script src="/marked.min.js"></script>
  <script src="/codemirror.min.js"></script>
  <script src="/cm-markdown.min.js"></script>
  <script src="/cm-sublime.min.js"></script>
  <script src="/editor.js"></script>
`, mode);

export const deletePage = (
  { id = '', hasEditCode = false, errors = { editCode: '' }, mode = '' } = {}
) => layout(`delete ${id}`, `
  <main>
    <div>
      <em>are you sure you want to delete this paste?</em>
      <strong>${id}</strong>
    </div>
    <form method="post" action="/${id}/delete">
      <div class="input-group">
        ${_if(hasEditCode, `
          <div>
            <input
              name="editcode"
              type="text"
              placeholder="edit code"
              minlength="3"
              maxlength="40"
              required
              aria-invalid="${Boolean(errors.editCode)}"
              ${_if(errors.editCode, 'aria-describedby="editcode-error"')}
            />

            ${_if(errors.editCode, `
              <small class="error" id="editcode-error">${errors.editCode}</small>
            `)}
          </div>
        `)}
      </div>

      <div class="button-group">
        <button type="submit">
          delete
        </button>

        <a class="btn" href="/${id}">
          cancel
        </a>
      </div>
    </form>
  </main>
`, mode);

export const errorPage = (mode = '') => layout('404', `
  <main>
    <h1>404</h1>
    <p>That paste doesn't exist! Maybe it was deleted?</p>
  </main>
`, mode);
