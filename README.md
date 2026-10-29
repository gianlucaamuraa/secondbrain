# Second Brain

Diario di lavoro per enti e argomenti.

```
Ente (Comune di Sassari)
 └── Argomento (Lista di carico)
      ├── 27/10/2026 - 08:59  Inserita lista di carico
      ├── 27/10/2026 - 08:59  Inviato report al comune   [+ screenshot incollato]
      └── 27/10/2026 - 09:10  [ ] Chiedere a Giorgio situazione   (da fare)
```

## Uso

- **Invio** salva la nota con data e ora. **Shift+Invio** va a capo.
- **Ctrl+V** incolla screenshot e immagini dentro il testo. Puoi scrivere sopra, accanto e sotto.
- Trascina o allega con il pulsante **Allega** qualsiasi file (PDF, Excel, ...).
- Le tabelle copiate da Excel restano tabelle.
- Spunta **Da fare** prima di salvare per trasformare la nota in un'attività. Puoi darle una **scadenza** (campo data, oppure Oggi / Domani). Per cambiarla o toglierla in seguito, clicca sulla data della nota.
- La pagina **Da fare** raccoglie le attività aperte, divise in Scadute, Oggi, Domani, Prossimi 7 giorni, Più avanti e Senza scadenza.
- Il **Calendario** mostra le scadenze giorno per giorno. Clicca un giorno per vederne l'elenco, spuntare le attività fatte o spostarle.
- Ci sono due elenchi separati: **Enti** (i comuni) e **Attività** (tutto ciò che non è un comune, es. Formazione). Ognuno ha i suoi argomenti e le sue note.
- Nella barra laterale ogni elenco ha un menu a tendina con ricerca: scrivi per cercare, usa le frecce e Invio. Se il nome non esiste, il menu propone di crearlo; anche **+** crea una voce nuova.
- Se hai messo una voce nell'elenco sbagliato, aprila e usa **Sposta in Enti** / **Sposta in Attività**.
- Enti e argomenti sono sempre in ordine alfabetico.
- **Formattazione**: usa la barra sopra il testo (grassetto, corsivo, sottolineato, barrato, evidenziato, titolo, sottotitolo, elenchi, caselle di controllo, citazione, link) oppure le scorciatoie a inizio riga: `- ` elenco, `1. ` elenco numerato, `[] ` casella, `# ` titolo, `## ` sottotitolo, `> ` citazione. Dentro un elenco Invio crea una nuova voce: per salvare usa **Ctrl+Invio**. Le caselle si spuntano anche sulla nota già salvata.
- **Scarica** (in alto a destra):
  - nella pagina di un **ente** scarica l'elenco degli argomenti, con titolo e data di creazione;
  - nella pagina di un **argomento** scarica tutte le note, con data e ora, formattazione e immagini.

  Puoi scegliere tra **Word** (.docx modificabile) e **PDF**. Serve la connessione a internet, perché i componenti di esportazione vengono scaricati al primo uso.
- Passa sopra una nota per **Modifica**, **Elimina** o **Da fare**.
- Clicca un'immagine per ingrandirla.
- La ricerca a sinistra cerca in enti, argomenti e testo di tutte le note.
- Se lasci un argomento a metà nota, la bozza resta salvata.

## Prova subito (modalità locale)

Apri `index.html` con Chrome o Edge. Con `js/config.js` vuoto i dati restano **solo in quel browser**: va bene per provare, non per l'uso vero.

## Messa online (una volta sola, circa 15 minuti)

### 1. Supabase (database e file, gratuito)
1. Crea un account su https://supabase.com e poi un **New project** (regione: Europe, Frankfurt).
2. **SQL Editor → New query**: incolla il contenuto di `supabase/schema.sql` e premi **Run**.
3. **Authentication → Users → Add user → Create new user**: inserisci la tua email e una password e spunta *Auto Confirm User*.
4. **Authentication → Sign In / Providers → Email**: disattiva **Allow new user sign ups**, così nessun altro può registrarsi.
5. **Project Settings → API**: copia *Project URL* e *anon public key* in `js/config.js`.

### 2. GitHub Pages (pubblicazione, gratuito)
1. Crea un repository su GitHub (es. `secondbrain`) e caricaci questa cartella.
2. **Settings → Pages → Source: Deploy from a branch → main / (root)**.
3. Dopo un minuto l'app è su `https://<tuo-utente>.github.io/secondbrain/`.

Il codice può stare in un repository pubblico: dentro non ci sono dati. Note e file sono su Supabase e li vedi solo dopo il login.

## Note
- Sul piano gratuito Supabase mette in pausa il progetto dopo 7 giorni senza accessi. I dati non si perdono: si riattiva dalla dashboard con un clic.
- Spazio gratuito: 500 MB di database e 1 GB di file.
- **Esporta backup** (in basso a sinistra) scarica un JSON con tutti i testi.
