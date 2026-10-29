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

## Più persone: spazi di lavoro e tag

```
Personale            ← solo tuo (qui ci sono i dati che avevi già)
Ufficio riscossione  ← spazio condiviso: Gianluca, Giorgio, Maria…
```

- **Spazi di lavoro**: in alto a sinistra scegli lo spazio. *Personale* lo vedi solo tu. Con **Nuovo spazio condiviso** ne crei uno da usare insieme ad altri: tutti gli utenti dello spazio vedono e modificano gli stessi enti, argomenti e note. Dashboard, Da fare, Calendario e ricerca mostrano lo spazio scelto.
- **Aggiungere utenti** (pagina **Persone**, in uno spazio condiviso): scrivi nome ed email e premi *Aggiungi*. La persona apre l'app, sceglie **Primo accesso? Crea la tua password** e usa quell'email. Se ha già un account le basta accedere. Possono registrarsi solo le email invitate.
- **Utenza condivisa**: se più persone usano lo stesso account, nella pagina **Persone** aggiungi i loro nomi *senza email*. Non hanno un accesso proprio, ma puoi taggarle. Funziona anche nello spazio Personale.
- **Taggare**: in una nota scrivi **@** (oppure premi **Tagga**) e scegli la persona. Frecce per muoverti, Invio o Tab per inserire.
- **Menzioni**: raccoglie le note in cui sei taggato (il numero accanto conta le attività ancora da fare). In alto puoi scegliere un'altra persona per vedere le note in cui è taggata lei. Cliccando un tag dentro una nota apri le sue menzioni.
- **Spostare un ente** in un altro spazio: nella pagina dell'ente usa il pulsante con la cartella e la freccia. Si spostano anche argomenti, note e allegati.
- Negli spazi con più utenti ogni nota mostra chi l'ha scritta. In **Persone** imposti anche il tuo nome.
- Chi ha creato lo spazio può rinominarlo, eliminarlo, togliere persone. Gli altri possono uscirne.

## Prova subito (modalità locale)

Apri `index.html` con Chrome o Edge. Con `js/config.js` vuoto i dati restano **solo in quel browser**: va bene per provare, non per l'uso vero.

## Messa online (una volta sola, circa 15 minuti)

### 1. Supabase (database e file, gratuito)
1. Crea un account su https://supabase.com e poi un **New project** (regione: Europe, Frankfurt).
2. **SQL Editor → New query**: incolla il contenuto di `supabase/schema.sql` e premi **Run**.
3. **Authentication → Users → Add user → Create new user**: inserisci la tua email e una password e spunta *Auto Confirm User*.
4. **Authentication → Sign In / Providers → Email**: lascia attivo **Allow new user sign ups**, così le persone invitate possono creare la loro password. Il database accetta solo le email invitate in uno spazio, quindi nessun altro può registrarsi. Se preferisci, disattiva **Confirm email**: gli invitati entrano subito, senza aspettare l'email di conferma (il servizio email gratuito di Supabase manda pochi messaggi l'ora).
5. **Authentication → URL Configuration**: in *Site URL* metti l'indirizzo dell'app (es. `https://<tuo-utente>.github.io/secondbrain/`), così il link di conferma riporta all'app.
6. **Project Settings → API**: copia *Project URL* e *anon public key* in `js/config.js`.

### Aggiornare un database già creato
Se usavi già l'app, rilancia `supabase/schema.sql` in **SQL Editor** (si può rieseguire senza perdere nulla). I tuoi enti finiscono nello spazio *Personale*. Poi segui i punti 4 e 5 qui sopra per permettere agli invitati di registrarsi.

In alternativa agli inviti da app puoi creare gli utenti a mano (**Authentication → Users → Add user**), ma solo dopo averli invitati dalla pagina **Persone**: un'email non invitata viene rifiutata.

### 2. GitHub Pages (pubblicazione, gratuito)
1. Crea un repository su GitHub (es. `secondbrain`) e caricaci questa cartella.
2. **Settings → Pages → Source: Deploy from a branch → main / (root)**.
3. Dopo un minuto l'app è su `https://<tuo-utente>.github.io/secondbrain/`.

Il codice può stare in un repository pubblico: dentro non ci sono dati. Note e file sono su Supabase e li vedi solo dopo il login.

## Note
- Sul piano gratuito Supabase mette in pausa il progetto dopo 7 giorni senza accessi. I dati non si perdono: si riattiva dalla dashboard con un clic.
- Spazio gratuito: 500 MB di database e 1 GB di file.
- **Esporta backup** (in basso a sinistra) scarica un JSON con tutti i testi.
