# Vogatore

Web app per il vogatore ad acqua Domyos: legge i dati via Bluetooth (FTMS, Rower Data 0x2AD1), riceve la frequenza cardiaca da una fascia o da un orologio che la trasmette (servizio 0x180D) e guida l'allenamento con un coach che regola i watt sulla FC. Tutto in un solo file, `index.html`, pubblicato su GitHub Pages. Su iPhone va aperta in Bluefy, perché Safari non dà il Bluetooth alle pagine web.

## Cosa fa

- Potenza, passo, colpi al minuto, distanza, calorie, FC con zona (Karvonen), grafico degli ultimi 5 minuti.
- Coach: test di taratura, fondo, soglia, intervalli, scala di frequenza; nei fondi sposta i watt per tenere la FC in zona 2, nei blocchi intensi corregge i successivi sulla FC di fine blocco (mediana degli ultimi 20 s).
- Piano di 8 settimane (24 sedute) con cicli successivi: fondi più lunghi del 15% a ciclo.
- A fine seduta: resoconto con esito, confronto con una seduta simile, deriva cardiaca, tempo nelle zone, recupero della FC a 1 minuto dopo il test, fatica percepita (1–10) e prossimo passo.
- Progressi: soglia nel tempo, watt per battito nei fondi, minuti per zona nelle ultime 8 settimane, tabella dei test.
- Storico sul telefono: tutti i riepiloghi (fino a 1000), dati secondo per secondo per i 60 più recenti. In vista le ultime tre sedute, una riga ciascuna; le altre, divise per mese con i totali, si aprono con un tocco; i dettagli di una seduta al tocco sulla riga. Esportazione TCX per Garmin Connect e Strava, CSV.
- Copia di sicurezza JSON da salvare o incollare, e ripristino.
- Schermo tenuto acceso col vogatore collegato o il coach pronto (se il browser lo consente: vedi Diagnostica).
- Accesso rapido in cima alla pagina: pulsante Cardio (stato e battiti, collegamento, istruzioni per il Fenix) e pulsante Video.
- Cardio: all'apertura l'app cerca da sola per 10 minuti l'ultimo cardio usato, se è tra i dispositivi già autorizzati, e lo aggancia appena trasmette (si spegne nel riquadro del cardio).
- Video YouTube dentro l'app, con vista a schermata unica in orizzontale: «Incolla il link e apri» legge gli appunti, un link incollato nel campo si apre subito, gli ultimi video restano in elenco con il titolo e ripartono da dove eri rimasto.

## Sviluppo

- `node tests/run.mjs` esegue i test delle parti pure (parser, filtro FC, analisi, TCX, commento, coach, piano). Le parti sono delimitate in `index.html` da commenti `/*NOME-START*/` e `/*NOME-END*/`.
- `index.html#veloce` fa scorrere il coach 60 volte più veloce: con la demo (parte da sola dove il Bluetooth non c'è) si prova un allenamento guidato in pochi secondi.
- La GitHub Action `Test` esegue controllo di sintassi e test a ogni push.

## Dati salvati

`localStorage`, chiavi `vg.*`: `vg.cfg` impostazioni, `vg.hist` storico, `vg.plan` piano, `vg.refs` storia della soglia, `vg.dev`/`vg.hrdev` dispositivi, `vg.videos` video recenti (titolo e punto raggiunto; sostituisce `vg.video`, letto una volta sola per non perdere l'ultimo link), `vg.log` registro.
