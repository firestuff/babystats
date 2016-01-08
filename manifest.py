import json
import webapp2


class Manifest(webapp2.RequestHandler):

  def get(self):
    self.response.headers['Content-Type'] = 'application/json'
    json.dump({
        'name': self.request.get('name'),
        'display': 'standalone',
        'icons': [
            {
                'src': '/static/icon.png',
                'sizes': '256x256',
            },
        ],
    }, self.response.out)


app = webapp2.WSGIApplication([
  ('/manifest.json', Manifest),
])
