"""Shared by tools/send_digest.py and tools/send_alerts.py: the newsletter Worker's admin
API (newsletter/worker.js) and the look of the emails.

Both scripts are off until two repository secrets are set (newsletter/README.md):
MAIL_API_URL, the Worker's address, and MAIL_ADMIN_TOKEN, its ADMIN_TOKEN.
"""
import json
import os
import sys
import time
import urllib.error
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from build_pages import CONSOLES, SITE, STAGES, TIERS, esc, fmt_date, slug_of  # noqa: E402


class MailAPI:
    def __init__(self):
        self.url = os.environ.get('MAIL_API_URL', '').strip().rstrip('/')
        self.token = os.environ.get('MAIL_ADMIN_TOKEN', '').strip()

    @property
    def ready(self):
        return bool(self.url and self.token)

    def call(self, method, path, body=None):
        data = json.dumps(body).encode() if body is not None else None
        for attempt in range(4):
            req = urllib.request.Request(self.url + path, data=data, method=method, headers={
                'Authorization': f'Bearer {self.token}', 'Content-Type': 'application/json',
                'User-Agent': 'recomphaven-mail'})
            try:
                with urllib.request.urlopen(req, timeout=60) as resp:
                    return json.load(resp)
            except urllib.error.HTTPError as err:
                detail = err.read().decode('utf-8', 'replace')[:300]
                if err.code < 500 or attempt == 3:
                    raise SystemExit(f'{method} {path}: HTTP {err.code} {detail}')
            except (urllib.error.URLError, TimeoutError, ConnectionError) as err:
                if attempt == 3:
                    raise SystemExit(f'{method} {path}: {getattr(err, "reason", err)}')
            time.sleep(5 * 2 ** attempt)

    def get(self, path):
        return self.call('GET', path)

    def post(self, path, body):
        return self.call('POST', path, body)

    def send_list(self, list_name, subject, html, text):
        """Sends to everyone on a list, a page at a time. Returns (sent, stopped_by_limit)."""
        sent, after = 0, 0
        while True:
            r = self.post('/admin/send', {'list': list_name, 'subject': subject, 'html': html, 'text': text, 'after': after})
            sent += r.get('sent', 0)
            if r.get('limited'):
                return sent, True
            if r.get('next') is None:
                return sent, False
            after = r['next']


def game_url(e):
    return f'{SITE}/games/{slug_of(e["title"])}/'


def console_label(e):
    return CONSOLES.get(e['console'], {}).get('label', e['console'])


def facts(e):
    """"B tier · Playable beta · Nintendo Switch"."""
    return f'{e["quality"]} tier · {STAGES[e["stage"]]["label"]} · {console_label(e)}'


def cover(e, size=56):
    if e.get('cover'):
        return (f'<img src="{SITE}/{esc(e["cover"])}" width="{size}" alt="" '
                f'style="display:block;width:{size}px;height:auto;border-radius:6px">')
    return (f'<div style="width:{size}px;height:{size}px;border-radius:6px;background:#e8eaf1;color:#586074;'
            f'font-weight:700;font-size:15px;line-height:{size}px;text-align:center">{esc(e["title"][:2].upper())}</div>')


def item_row(e, lines):
    """A game in a list: cover, linked title, then lines of already-escaped HTML."""
    body = ''.join(f'<div style="font-size:13px;color:#586074;margin-top:2px">{x}</div>' for x in lines)
    return (f'<tr><td style="padding:10px 12px 10px 0;vertical-align:top;width:56px">{cover(e)}</td>'
            f'<td style="padding:10px 0;vertical-align:top;border-bottom:1px solid #e8eaf1">'
            f'<a href="{game_url(e)}" style="color:#141622;font-weight:700;font-size:15px;text-decoration:none">{esc(e["title"])}</a>'
            f'{body}</td></tr>')


def button(href, label, ghost=False):
    style = ('background:#ffffff;color:#3d4ad0;border:1px solid #3d4ad0' if ghost
             else 'background:#3d4ad0;color:#ffffff;border:1px solid #3d4ad0')
    return (f'<a href="{esc(href)}" style="display:inline-block;{style};text-decoration:none;font-weight:600;'
            f'font-size:14px;padding:9px 16px;border-radius:8px;margin:0 8px 8px 0">{esc(label)}</a>')


def email_html(title, preheader, body, why):
    """A whole email. why: one line on why they get it, above the manage and unsubscribe links."""
    return f'''<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>{esc(title)}</title></head>
<body style="margin:0;padding:0;background:#f2f3f7;color:#141622;font-family:system-ui,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
<div style="display:none;max-height:0;overflow:hidden">{esc(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f2f3f7"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px">
<tr><td style="padding:0 4px 18px"><a href="{SITE}/"><img src="{SITE}/assets/logo.png" alt="Re:Haven" width="190" style="display:block;width:190px;height:auto;border:0"></a></td></tr>
<tr><td style="background:#ffffff;border:1px solid #d3d7e2;border-radius:10px;padding:22px 22px 14px">
{body}
</td></tr>
<tr><td style="padding:16px 4px;font-size:12px;line-height:1.5;color:#586074">
{esc(why)}<br>
<a href="{{{{unsubscribe}}}}" style="color:#586074">Unsubscribe</a> · <a href="{{{{manage}}}}" style="color:#586074">Manage your emails</a> · <a href="{SITE}/" style="color:#586074">recomphaven.com</a>
</td></tr>
</table>
</td></tr></table>
</body>
</html>'''


def email_text(body, why):
    return f'{body.strip()}\n\n--\n{why}\nUnsubscribe: {{{{unsubscribe}}}}\nManage your emails: {{{{manage}}}}\n'


__all__ = ['MailAPI', 'TIERS', 'button', 'email_html', 'email_text', 'esc', 'facts', 'fmt_date', 'game_url',
           'item_row', 'console_label', 'SITE']
