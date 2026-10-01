"""Локальный сервер предпросмотра без кэша: браузер всегда берёт свежие модули (иначе после правок виден старый form.js).
Запуск: python tools/serve.py [порт] — из папки проекта."""
import sys, http.server, functools, pathlib

class NoCache(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, must-revalidate")
        super().end_headers()

port = int(sys.argv[1]) if len(sys.argv) > 1 else 8790
root = pathlib.Path(__file__).resolve().parent.parent
handler = functools.partial(NoCache, directory=str(root))
http.server.ThreadingHTTPServer(("127.0.0.1", port), handler).serve_forever()
