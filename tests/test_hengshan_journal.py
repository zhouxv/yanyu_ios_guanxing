import json
from pathlib import Path
import tempfile
import unittest
from urllib.request import Request, urlopen

from desktop.server import LocalSite


class JournalRoundTrip(unittest.TestCase):
    def test_resume_reuse_and_separate_archive(self):
        with tempfile.TemporaryDirectory() as folder:
            def open_site(data, owner='alpha'):
                s = LocalSite(folder, journal_root=folder)
                s.set_snapshot(data,sequence_owner=owner)
                return s

            def post(s, op, **args):
                request = Request(s.url + 'api/hengshan-sequence',
                                  json.dumps(dict(op=op, **args)).encode(),
                                  {'Origin': s.origin, 'Content-Type': 'application/json'})
                with urlopen(request, timeout=5) as response:
                    return json.load(response)

            site = open_site({'example': 1})
            try:
                scope = post(site, 'open')['scope']
                cfg = {'selected':['one'], 'groups':[['a','b','c']]}
                post(site,'batch',scope=scope, config=cfg)
                task='a'*64
                post(site,'mark',scope=scope,task=task,status='limited',budget=4,cap=10)
                route=dict(verified=True,rule='test',name='测试',date='',batch='在册',targets=['a','b','c'],groupName='目标',days=1,level=80,finalTalents=['a','b','c'],washes=1,moves=[-1,0])
                post(site,'save-route',scope=scope,task=task,route=route)
                post(site,'save-route',scope=scope,task=task,route={**route,'washes':2,'moves':[-1,1,0]})
            finally:
                site.close()
            site=open_site({'example': 1})
            try:
                restored=post(site,'open')
                self.assertEqual(restored['config'],cfg)
                self.assertEqual((restored['routes'][0]['washes'],restored['marks'][0]['cap']),(1,10))
                self.assertEqual(post(site,'route',scope=scope,task=task)['moves'],[-1,0])
                site.set_snapshot({'example': 2},sequence_owner='alpha')
                other=post(site,'open')
                self.assertEqual(len(other['routes']),1)
                self.assertIsNone(other['config']);self.assertEqual(other['marks'],[])
                site.set_snapshot({'example': 2},sequence_owner='beta')
                self.assertEqual(post(site,'open')['routes'],[])
                self.assertTrue((Path(folder)/'hengshan-sequences.sqlite3').is_file())
            finally:
                site.close()