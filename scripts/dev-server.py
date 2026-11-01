#!/usr/bin/env python3
"""Local preview server that behaves like Vercel's cleanUrls: /pricing serves pricing.html,
/guides/ serves guides/index.html. Usage: python3 scripts/dev-server.py [port]"""
import http.server, os, sys

class H(http.server.SimpleHTTPRequestHandler):
    def send_head(self):
        path = self.translate_path(self.path)
        if not os.path.exists(path) and os.path.exists(path + ".html"):
            self.path = self.path.split("?")[0].split("#")[0] + ".html"
        return super().send_head()

if __name__ == "__main__":
    os.chdir(os.path.join(os.path.dirname(__file__), ".."))
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8780
    http.server.ThreadingHTTPServer(("127.0.0.1", port), H).serve_forever()
