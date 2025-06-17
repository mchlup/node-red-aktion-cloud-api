# node-red-aktion-cloud-api

Děkuji, pustím se do analýzy API dokumentace Aktion Cloud a připravím návrh pro funkční modul do Node-Red, který umožní číst přítomnost uživatelů, nastavovat docházku a spravovat konfiguraci pomocí přehledného rozhraní. Jakmile budu mít hotové podklady, dám ti vědět.


# Návrh Node-RED modulu pro Aktion Cloud API (docházka)

## Architektura modulu a komponenty

Modul bude implementován jako sada vlastních Node-RED nodů, které umožní snadnou integraci s Aktion Cloud API pro evidenci docházky. Hlavní součásti architektury budou:

* **Konfigurační node pro připojení k API** – centralizuje přihlašovací údaje (e-mail a API klíč) a případně URL instance Aktion Cloud. Tento config node zajistí opakované použití přihlašovacích údajů pro více nodů v rámci modulu.
* **Node pro čtení přítomnosti uživatelů** – zajišťuje volání API pro zjištění aktuálně přítomných osob a identifikaci posledního přítomného uživatele.
* **Node pro zápis docházky (příchod/odchod)** – umožňuje vytvořit záznam o příchodu nebo odchodu uživatele (včetně volitelného typu, jako je např. služební cesta) pomocí příslušného API volání.
* Vnitřně budou nody komunikovat s Aktion Cloud WebAPI pomocí HTTP požadavků (typicky RESTful volání). Architektura je navržena modulárně – přidání dalších nodů (např. pro jiné agendy nebo funkce API) bude možné bez zásahu do stávajících komponent, což usnadňuje budoucí rozšíření.

## Autentizace a komunikace s API

Komunikace s Aktion Cloud probíhá zabezpečeně pomocí API klíče a dočasného tokenu:

* **Přihlašovací údaje:** V konfiguračním rozhraní modulu uživatel zadá e-mail (uživatelské jméno) a příslušný API klíč. Tyto údaje slouží k ověření uživatele vůči Aktion Cloud API.
* **Získání tokenu:** Před každým voláním chráněného endpointu modul nejprve provede přihlášení přes endpoint `POST /login` a získá time‑limited token (dočasný token). Platnost tokenu je pouze cca 20 sekund, takže pro každou operaci (nebo sadu rychlých operací) se token generuje znovu. Token se předává buď v parametru `Token` nebo v hlavičce u následujících API volání (dle dokumentace Aktion Cloud).
* **Oprávnění:** Modul předpokládá, že přihlašovaný uživatel má v Aktion Cloud potřebná práva k požadovaným operacím (např. právo „Zobrazit osoby“ pro čtení seznamu osob, právo „Editace docházky“ pro vkládání průchodů apod.). API respektuje nastavená oprávnění uživatele – pokud uživatel nemá potřebná práva, volání se neprovede. Modul na tyto situace reaguje vrácením chybové zprávy na výstup.

## Čtení přítomnosti uživatelů

Tato funkce zajistí zobrazení aktuálně přítomných osob v systému a identifikaci posledního příchozího uživatele:

* **Volání API:** Po získání platného tokenu provede node volání endpointu `GET /HwStructure/getAllPersonWithCurrentAccess`. Podle dokumentace tento endpoint vrací **seznam osob s aktuálním přístupem**, tedy seznam uživatelů, kteří jsou momentálně přítomni (např. přihlášeni přes docházkový systém). Je možné volit parametr pro omezení na určitou část HW struktury (např. konkrétní snímač nebo uzel), případně stránkování, ale výchozí použití vrátí všechny aktuálně přítomné osoby.
* **Zpracování dat:** Node obdrží od API JSON seznam přítomných osob. Každá položka typicky obsahuje identifikátor osoby (PersonID) a případně další atributy (dostupné údaje mohou zahrnovat jméno, příjmení nebo osobní číslo uživatele – podle implementace API). Pro získání detailních informací (např. celé jméno, login) k uživateli může modul následně využít endpoint `GET /person/get?PersonId={ID}` pro dané ID osoby. Tím získá jméno a přihlašovací jméno (login ve formátu jmeno.prijmeni) posledního přítomného uživatele.
* **Určení „posledního přítomného“:** Ze získaného seznamu modul zjistí *posledního přítomného uživatele*. Může to být uživatel s nejnovějším časem příchodu. Pokud API vrací i čas posledního průchodu u každé osoby, node jej využije k seřazení; jinak lze alternativně získat poslední průchod z logu událostí (např. voláním `GET attendance/getPassAll` s filtrováním na poslední záznam). Pro jednoduchost modul předpokládá, že seznam je již filtrován na aktuálně přítomné a jako „poslední přítomný“ označí toho, kdo se naposledy zaevidoval.
* **Výstupy nodu:** Node **Čtení přítomnosti** bude mít vícenásobné výstupy pro pohodlné směrování dat:

  1. **Jméno posledního přítomného uživatele** – textový výstup obsahující jméno a příjmení.
  2. **ID posledního přítomného** – unikátní identifikátor osoby (PersonID) z Aktion Cloud.
  3. **Login posledního přítomného** – uživatelský login (ve formátu `jmeno.prijmeni`).
  4. **Kompletní JSON seznam přítomných** – strukturovaná data (pole objektů) všech aktuálně přítomných osob, jak byla vrácena API. Tento výstup obsahuje všechny relevantní informace (např. více uživatelů, jejich ID apod.) pro případné další zpracování v rámci flow.

Node tak umožní snadno zobrazit např. na dashboardu seznam přítomných zaměstnanců i s informací, kdo byl poslední, kdo se přihlásil.

## Nastavení docházky (příchod/odchod)

Druhý node v modulu umožní vytvářet záznamy docházky – typicky evidovat ručně příchozí nebo odchozí průchod pro vybraného uživatele, včetně specifikace druhu tohoto záznamu:

* **Druhy záznamů:** Uživatel v konfiguraci (nebo pomocí vstupní zprávy) zvolí, zda se jedná o **příchod** nebo **odchod** a případně vybere **typ akce**. Typ akce reprezentuje charakter docházkového záznamu – například standardní příchod/odchod, **služební cesta**, dovolená, nemoc atd. (Služební cesta by mohla být evidována jako speciální druh záznamu namísto fyzického průchodu turniketu.)
* **Volání API pro průchod:** Aktion Cloud WebAPI podporuje tzv. předávání dat o průchodech na docházkových snímačích. Node tedy využije příslušný endpoint pro vložení průchodu (docházkového záznamu) – v dokumentaci je uvedeno, že API umožňuje vkládat údaje o průchodech (manuální záznam docházky). Konkrétně to může být např. volání `POST /attendance/setPass` nebo obdobné (dle API dokumentace; v některých verzích může jít o volání v rámci agendy „Docházka“ nebo přes objekt osoby). Při volání se předají parametry:

  * **Token** ověřeného uživatele (jako query param nebo v hlavičce, viz výše).
  * **PersonID cílového uživatele** – identifikace osoby, pro niž se má záznam vytvořit.
  * **Čas a směr průchodu** – časový údaj průchodu (pokud není použit aktuální čas) a označení, zda jde o příchod nebo odchod. Směr může být určen např. parametrem `PassType` (kde hodnoty mohou být 0=příchod, 1=odchod, apod.).
  * **Typ docházkové akce** – pokud je potřeba rozlišit speciální typ (služební cesta, dovolená…), použije se kód mzdové složky nebo externí kód definovaný v systému pro daný druh absence/přítomnosti. (API poskytuje seznam „mzdových složek“ s externími kódy přes `GET attendance/getSalaryElementsAll`, což může modul využít k nalezení správného kódu pro např. služební cestu.)
* **Zpracování odpovědi:** Po odeslání požadavku API vrátí výsledek operace – např. potvrzení úspěchu nebo popis chyby. Node vyhodnotí kód odpovědi (HTTP status a případný JSON v těle odpovědi). Při úspěchu může API vrátit i detaily vytvořeného záznamu (např. ID události nebo upravený stav docházky).
* **Výstupy nodu:** **Node pro zápis docházky** rovněž nabídne více výstupů, aby bylo možné snadno reagovat na výsledky:

  1. **Stav/ zpráva výsledku** – slovní nebo číselné vyjádření výsledku operace. Např. „OK“ / „ExecOK“ při úspěchu, nebo chybový kód a zpráva při neúspěchu (např. „Token expired“ nebo „Access denied“).
  2. **ID uživatele / osoba** – pro kontrolu a další logiku může druhý výstup vracet ID dotčené osoby (shodné s vstupním nastavením).
  3. **Upřesnění záznamu** – např. typ akce, který byl aplikován, nebo čas, který byl zapsán. (Případně lze využít tento výstup pro odlišení příchodu vs. odchodu, pokud by na vstupu nebylo jasné – zde ale zřejmě bude typ předem určen konfigurací nebo vstupní zprávou.)
  4. **Kompletní JSON odpověď** – plná odpověď API ve formátu JSON, obsahující všechny relevantní informace o vytvořeném záznamu. To může zahrnovat jak potvrzení, tak případné detaily uloženého průchodu (čas, typ, apod.), pokud je API poskytuje.

Tato funkcionalita umožní například automatizované **vložení příchodů a odchodů** – Node-RED může na základě časového plánu automaticky označit odchod všech přítomných ve stanovený čas, nebo na základě externího podnětu (tlačítko, čtečka) vytvořit záznam o příchodu uživatele.

## Konfigurace uživatelského rozhraní nodů

Každý node v modulu bude mít konfigurovatelné rozhraní v editoru Node-RED, které umožní přizpůsobit chování:

* **Přihlašovací údaje:** Volba reference na konfigurační node s přihlášením (e-mail + API klíč) do Aktion Cloud. Uživatel tak zadá údaje jen jednou a všechny nody modulu je sdílejí. *(Alternativně může mít každý node políčka pro e-mail a API klíč přímo, ale použití společné konfigurace je vhodnější pro správu a bezpečnost.*)
* **Volba operace / režimu:** Pokud by byl navržen univerzálnější node, mohl by obsahovat přepínač režimu **Čtení vs. Zápis**. Nicméně v navržené architektuře jsou tyto funkce oddělené do dvou specializovaných nodů. V případě nodu pro zápis docházky se ale nabízí volba typu akce (příchod nebo odchod) přímo v jeho nastavení, případně další rozšíření (viz níže). U nodu pro čtení přítomnosti není volba režimu potřeba – jeho účel je dán (read-only).
* **Cílový uživatel:** Pro node zápisu docházky bude v UI pole pro zadání cílového uživatele, jehož docházka se mění. Může to být formou textového pole (kam se vyplní ID osoby, případně login) nebo komfortněji výběrem ze seznamu známých uživatelů (např. načteného pomocí `GET person/getAll`). Formát identifikace by měl odpovídat tomu, co vyžaduje API – nejspíše **PersonID** daného uživatele. *(Pozn.: Login ve formátu jmeno.prijmeni patrně nelze použít přímo v API volání ke změně docházky, slouží spíše pro přehled – API očekává ID osoby.)*
* **Typ docházkové akce:** V případě, že administrátor chce pevně nastavit druh zapisované akce (např. že tento node vždy zapisuje „služební cestu“ jako příchod), může UI obsahovat rozbalovací seznam typů. Hodnoty v seznamu by odpovídaly dostupným mzdovým složkám/typům akcí v systému (např. *Standardní příchod/odchod*, *Služební cesta*, *Dovolená* atd.). Výběrem typu pak node použije odpovídající kód v API volání. Pokud typ nebude v konfiguraci vybrán, může node očekávat, že mu typ akce případně dodá vstupní zpráva (pokročilejší scénář), nebo použije výchozí „standardní“ průchod.

Konfigurační rozhraní je navrženo tak, aby bylo co nejvíce uživatelsky přívětivé – srozumitelné popisky polí a případná nápověda (tooltipy) u položek jako API klíč či ID uživatele. U citlivých údajů (API klíč) bude pole typu heslo, aby nebyl klíč v UI viditelný.

## Využití a výstupy v Node-RED flow

Po nasazení modulu může uživatel Node-RED jednoduše začlenit tyto nody do svých flow:

* **Node Čtení přítomnosti** se typicky použije např. s časovačem (Inject node nastavující interval, např. každých 5 minut) pro pravidelnou aktualizaci seznamu přítomných. Výstupy tohoto nodu lze napojit na **dashboard** prvky – seznam osob, displej posledního přihlášeného atp. Díky samostatným výstupům není nutné zprávu dále rozebírat k získání jména nebo ID – ty jsou k dispozici přímo.
* **Node Zápis docházky** může být využit v reakci na různé události: ruční spuštění (tlačítko na dashboardu pro označení příchodu/odchodu konkrétního uživatele), automatické odhlášení všech v určitou hodinu, nebo integrace s jiným systémem (např. při přijetí HTTP požadavku z jiného systému s informací o práci z domova). Node očekává vstup (například prázdnou zprávu jen ke spuštění akce, nebo naopak strukturovanou zprávu s detaily jako ID uživatele a typ – podle konfigurace). Po provedení zápisu docházky node na výstupech poskytne informace o výsledku, které mohou téct do dalších částí flow – např. upozornění, logování, podmíněné další akce (pokud zápis selhal, lze větevmi flow řešit opakování či alarm).

## Možnosti rozšíření do budoucna

Návrh počítá s budoucí rozšiřitelností:

* **Další API volání:** Aktion Cloud API nabízí mnoho dalších endpointů (např. práce s osobními údaji, přístupovými oprávněními, návštěvami, přehledy docházky aj.). Modul lze rozšířit o nové nody pokrývající tyto funkce – např. node pro získání spočítaných docházkových dat zaměstnance (`POST attendance/getAttendanceData` vrací souhrn odpracované doby, absencí apod.), node pro správu uživatelů (zakládání/mazání uživatelů přes API) atd. Díky společnému konfiguračnímu nodu využijí i nové nody existující nastavení přístupu.
* **Rozšíření stávajících nodů:** Navržené nody lze vylepšovat – např. **node čtení přítomnosti** může dostat volbu filtru pro určitá oddělení nebo lokace (pokud API podporuje parametr pro omezení rozsahu `getAllPersonWithCurrentAccess`), nebo může rovnou vracet počet přítomných osob jako další výstup. **Node zápis docházky** lze rozšířit o hromadné operace (např. označit jedním voláním více lidí jako odešlé) nebo o zpětné čtení a kontrolu (node by po zapsání mohl z API ověřit, že uživatel má nyní stav „přítomen/nepřítomen“).
* **Uživatelské rozhraní:** V budoucnu lze doplnit validace v UI (např. ověření formátu emailu, délky API klíče) a možná integraci s Aktion Cloud přímo v editoru – např. tlačítko „Otestovat připojení“, které ověří, zda jsou zadané údaje správné a API dostupné.

Celkově tento modul umožní snadnou integraci docházkového systému Aktion Cloud do automatizačních scénářů v Node-RED. Díky využití oficiálního WebAPI Aktion (NEXT/CLOUD) a dodržení postupů (tokenová autentizace, volání definovaných endpointů) je zajištěna kompatibilita a bezpečnost komunikace s docházkovým systémem. Modul je navržen tak, aby pokrýval aktuální požadavky (přehled přítomných, zápis příchod/odchod) s možností dalšího rozvoje podle budoucích potřeb.

**Zdroje:** Dokumentace Aktion Cloud WebAPI, interní návrh architektury Node-RED modulu.
