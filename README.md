# welcome to your past

**[abrir no ar](https://nuwget.github.io/welcome-to-your-past/)** · <https://nuwget.github.io/welcome-to-your-past/>

Uma janela pixelada à noite, com chuva, o Dudu e a Bubu no parapeito e a faixa tocando. A cena é desenhada em canvas sem blur nenhum e reage à música: os fogos de artifício, as janelas da cidade e o halo da lua acompanham os graves, médios e agudos.

Letra e música minhas, geradas com IA.

## Como funciona

- **Cena** (`js/scene.js`): janela, chuva, parapeito e os dois sprites, todos em pixel art nítido num canvas pequeno escalado em pixels inteiros. Os sprites vêm de um rasterizador de elipses sombreadas: luz da lua, rampas com dithering ordenado, contorno de 1px com brilho lunar.
- **Player** (`js/app.js`): botão de play, voltar 10s, repetir, tela cheia, capa gerada no canvas, waveform desenhado do próprio áudio e as letras sincronizadas por tempo.
- **Áudio**: a Web Audio API só analisa os níveis (bass/mid/treble); o som nunca passa por processamento.

## Estrutura

| Caminho | O que é |
| --- | --- |
| `index.html` | página principal, player e lyrics |
| `css/style.css` | tema da noite, dock e responsivo |
| `js/scene.js` | a cena pixelada reativa ao áudio |
| `js/app.js` | player, análise, waveform e lyrics |
| `data/lyrics.js` | as linhas com `t` (começo) e `end` (fim), editáveis à mão |
| `media/` | `track.m4a` e `track.mp3` |
| `tools/transcribe.py` | gera `data/lyrics.json` com Whisper |

## Desenvolvimento

```bash
./serve.sh        # abre em http://localhost:8000
```

Servidor local é necessário: a análise de áudio e o waveform não funcionam em `file://`.

Para mudar as letras, edite `data/lyrics.js`. Para regerar a transcrição: `.venv/bin/python tools/transcribe.py`.

## GitHub Pages

No ar em **https://nuwget.github.io/welcome-to-your-past/**

Publicada a cada push em `main` (branch raiz). É 100% estática, sem build.