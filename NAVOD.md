# Tabulky – návod

Appka na úpravy a zpracování tabulek z Excelu. Běží v telefonu i na počítači a funguje i bez internetu. Data se ukládají přímo v zařízení.

## Spuštění

Appka musí běžet z webové adresy (https). Když jen dvakrát kliknete na `index.html`, nebude fungovat instalace ani offline režim.

**Nejjednodušší cesta: GitHub Pages**
1. Na GitHubu založte nový repozitář, např. `tabulky`.
2. Nahrajte do něj **obsah** této složky (index.html, styles.css, sw.js, manifest.webmanifest a složky js, lib, icons).
3. V repozitáři otevřete Settings → Pages → Branch: `main`, složka `/ (root)` → Save.
4. Za minutu poběží na `https://gropa76.github.io/tabulky/`.

Stejně tak ji můžete nahrát na jakýkoli hosting (např. Wedos) do vlastní složky.

## Instalace jako aplikace

- **Android (Chrome):** otevřete adresu → menu ⋮ → *Přidat na plochu* / *Nainstalovat aplikaci*.
- **iPhone (Safari):** otevřete adresu → tlačítko Sdílet → *Přidat na plochu*.
- **PC (Chrome / Edge):** v adresním řádku ikona instalace, nebo tlačítko *Instalovat* vlevo dole v appce. Instalace nepotřebuje práva správce.

## Co appka umí

- **Import** .xlsx, .xls, .csv, .ods. Víc listů = víc tabulek. Vzorce z Excelu se převezmou.
- **Úpravy:** klik = výběr buňky, dvojklik nebo psaní = úprava, Enter/Tab = další buňka, Delete = smazat, Ctrl+Z/Ctrl+Y = zpět/znovu. Na telefonu: ťuknout = výběr, ťuknout znovu = úprava.
- **Vzorce** jako v Excelu (řádek 1 = názvy sloupců): `=B2*C2`, `=D2-E2`, `=SUMA(D2:D50)`, `=PRŮMĚR(…)`, `=MIN(…)`, `=MAX(…)`, `=POČET(…)`, `=ZAOKROUHLIT(B2*1,21;2)`, `=KDYŽ(B2>1000;"ano";"ne")`. Desetinná čárka, oddělovač středník.
- **Výpočet** (tlačítko v liště): nový sloupec nebo přepsání sloupce, + − × ÷ mezi sloupci nebo s číslem, zaokrouhlení.
- **Klik na název sloupce:** přejmenovat, seřadit, vložit, smazat, výpočet. **Klik na číslo řádku:** vložit, duplikovat, smazat.
- **Řádek pod tabulkou:** součet / průměr / minimum / maximum.
- **Výstup:** kroky přehled s mezisoučty (např. odběratel → zboží, pod každým odběratelem řádek „Celkem“), filtr, seskupit a spočítat, kontingenční tabulka, výpočet, měsíc/rok z data, seřadit, vybrat sloupce, přejmenovat, duplicity, prvních N. Výsledek stáhnete jako .xlsx nebo uložíte jako novou tabulku.
- **Postupy:** kroky si uložíte a pustíte na jakoukoli další tabulku. Když v ní nějaký sloupec chybí, appka ho označí a nechá vás vybrat jiný.
- **Spojit tabulky** (na přehledu): složí víc tabulek pod sebe, např. 12 měsíců do roční. Sloupce spáruje podle názvu a přidá sloupec *Měsíc*, který pozná z názvu tabulky (např. „srpen 2026“ → 2026-08).
- **Záloha** (⋯ na přehledu): stáhne všechna data do souboru .json. Tím je přenesete mezi telefonem a PC.

## Důležité

- Data jsou v každém zařízení zvlášť a mezi telefonem a PC se samy nesynchronizují. Přenášejte je zálohou.
- Data jsou uložená v prohlížeči. Když v něm smažete „data webů“, zmizí. Proto občas zálohujte.
- Po úpravě souborů appky zvyšte v `sw.js` číslo verze (`tabulky-v1` → `tabulky-v2`), aby si telefon stáhl novou verzi.
