import { HttpClient } from 'common';

 const urlParams = new URLSearchParams(window.location.search);

const port = urlParams.get('backendPort')||'3000'

const host = 'http://127.0.0.1'

const local = new HttpClient(`${host}:${port}`);

export async function health(){
    return await local.get('/api/health')
}