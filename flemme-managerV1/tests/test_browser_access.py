import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from flemme_manager.memory.browser_access import configure_browser_access


def client(origins):
    app=FastAPI()
    configure_browser_access(app,origins)
    @app.get('/api/v2/conversations')
    def read():return []
    return TestClient(app)


def test_site_can_send_authorization_without_allowing_other_origins():
    c=client('https://flemme.org,https://www.flemme.org')
    headers={'Origin':'https://flemme.org','Access-Control-Request-Method':'POST',
             'Access-Control-Request-Headers':'Authorization,Content-Type'}
    response=c.options('/api/v2/conversations',headers=headers)
    assert response.status_code==200
    assert response.headers['access-control-allow-origin']=='https://flemme.org'
    assert 'access-control-allow-credentials' not in response.headers
    headers['Origin']='https://unrelated.example'
    assert c.options('/api/v2/conversations',headers=headers).status_code==400


def test_no_origin_is_allowed_by_default_and_history_is_not_cacheable():
    response=client('').get('/api/v2/conversations',headers={'Origin':'https://flemme.org'})
    assert 'access-control-allow-origin' not in response.headers
    assert response.headers['cache-control']=='private, no-store'


@pytest.mark.parametrize('origin',['*','http://flemme.org','https://*.example','https://example/path',
                                  'https://user:password@example','https://example?query=yes'])
def test_invalid_origin_fails_closed(origin):
    with pytest.raises(ValueError):client(origin)
