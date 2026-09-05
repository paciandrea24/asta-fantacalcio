import pandas as pd

# 1. Inserisci i nomi esatti dei file
file_rose = "'al-fantalega_rosters_1786700145670.csv" 
file_giocatori = "Quotazioni_Fantacalcio_Stagione_2026_27 (2).xlsx" # <--- METTI IL TUO FILE EXCEL QUI

try:
    # 2. Leggiamo il file CSV delle rose (rimuovendo le righe con $)
    df_rose = pd.read_csv(file_rose, names=['Squadra', 'ID', 'Costo'])
    df_rose = df_rose[df_rose['Squadra'] != '$'].copy()
    
    print("Lettura del file CSV completata.")

    # 3. Leggiamo il file EXCEL dei giocatori
    # (Non servono più encoding strani o separatori per gli Excel!)
    df_giocatori = pd.read_excel(file_giocatori, skiprows=1)
    print("Lettura del file Excel completata.")
    
    # 4. Standardizziamo le colonne (tutto minuscolo) per evitare problemi (Id, ID, id...)
    df_giocatori.columns = [str(c).strip().lower() for c in df_giocatori.columns]
    
    colonna_id = 'id'
    
    # Verifichiamo se l'ID c'è nel file Excel
    if colonna_id not in df_giocatori.columns:
        print(f"Errore: Non trovo la colonna 'id' nel file Excel. Le colonne sono: {list(df_giocatori.columns)}")
    else:
        # Assicuriamoci che gli ID siano testo per poterli confrontare correttamente
        df_rose['ID'] = df_rose['ID'].astype(str).str.strip()
        df_giocatori[colonna_id] = df_giocatori[colonna_id].astype(str).str.strip()
        
        # Uniamo i due file
        df_finale = pd.merge(df_rose, df_giocatori, left_on='ID', right_on=colonna_id, how='left')
        
        # Troviamo la colonna del nome (di solito è "nome")
        colonna_nome = 'nome'
        if colonna_nome not in df_giocatori.columns:
            # Se non c'è, prendiamo la colonna che contiene la parola "nome" (es. "Nome Giocatore")
            possibili_nomi = [c for c in df_giocatori.columns if 'nome' in c]
            if possibili_nomi:
                colonna_nome = possibili_nomi[0]
            else:
                # Altrimenti proviamo a prendere la colonna numero 3 (indice 2) a caso
                colonna_nome = df_giocatori.columns[2]
                
        print(f"Sto usando la colonna '{colonna_nome}' come nome del giocatore.")
        
        # Rinominiamo la colonna in 'Nome'
        df_finale = df_finale.rename(columns={colonna_nome: 'Nome'})
        
        # Estraiamo solo le colonne che ci interessano e togliamo gli eventuali giocatori non trovati
        risultato = df_finale[['Squadra', 'Nome', 'Costo']].copy()
        
        # Se alcuni nomi sono vuoti (NaN), vuol dire che l'ID non era nel file Excel
        risultato['Nome'] = risultato['Nome'].fillna('Nome Non Trovato')
        
        # Salviamo il tutto in un bel file Excel finale!
        risultato.to_excel('Rose_Complete.xlsx', index=False)
        print("🎉 Fatto! Il file 'Rose_Complete.xlsx' è pronto nella tua cartella!")

except Exception as e:
    print(f"Si è verificato un errore: {e}")