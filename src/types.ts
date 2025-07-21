export interface ShipsData {
    [key: string]: string;
}

export interface ItemData {
    [key: string]: string;
}

export interface LanguageData {
    ships: ShipsData;
    item: ItemData;
}
