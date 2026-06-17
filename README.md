# websocket-game

## Message structure

### NAGŁÓWEK

| Przesunięcie w bajtach | Typ danych | Nazwa pola               | Opis / Podział bitowy                                                                                                                                                                                                    |
| :--- | :--- |:-------------------------|:-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **0 – 1** | `Uint16` | **Liczba punktów ($N$)** | Definiuje liczbę 4-bajtowych punktów współrzędnych, które następują bezpośrednio po nagłówku.                                                                                                                            |
| **2** | `Uint8` | **Kanał czerwony (R)**   | $0$ do $255$                                                                                                                                                                                                             |
| **3** | `Uint8` | **Kanał zielony (G)**    | $0$ do $255$                                                                                                                                                                                                             |
| **4** | `Uint8` | **Kanał niebieski (B)**  | $0$ do $255$                                                                                                                                                                                                             |
| **5** | `Uint8` | **Bajt flag i rozmiaru** | **Skompresowany bajt stanu (8 bitów):**<br>• **Bity 0-5 (6 bitów):** Rozmiar pędzla ($0$ do $63$)<br>• **Bit 6 (1 bit):** Czy nowa linia (`1` = tak, `0` = nie)<br>• **Bit 7 (1 bit):** Czy gumka (`1` = tak, `0` = nie) |
| **6 – 7** | `Uint16` | **Padding**              | wyrównanie do struktury 32-bitowej.                                                                                                                                                                             |

### BLOK DANYCH

| Względne przesunięcie | Typ danych | Nazwa pola | Opis / Zakres wartości                                   |
| :--- | :--- | :--- |:---------------------------------------------------------|
| **0 – 1** | `Uint16` | **Współrzędna X** | $0$ do $800$                                             |
| **2 – 3** | `Uint16` | **Współrzędna Y** | $0$ do $600$ |

## Uruchamianie projektu
```bash
mvn quarkus:dev
```