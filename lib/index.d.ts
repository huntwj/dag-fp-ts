interface Id {
    id: string;
}
declare type Edge = {
    from: string;
    to: string;
};
export declare type Dag<T extends Id = Id> = {
    nodes: T[];
    edges: Edge[];
};
export declare const empty: <T extends Id = Id>() => Dag<T>;
export {};
//# sourceMappingURL=index.d.ts.map