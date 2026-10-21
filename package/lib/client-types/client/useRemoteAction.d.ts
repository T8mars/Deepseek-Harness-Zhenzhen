export type CurrentAction = () => boolean;
export type RemoteAction = (current: CurrentAction) => Promise<void>;
export declare function useRemoteAction(api: object, fallback?: string): {
    busy: boolean;
    notice: string;
    setNotice: import("react").Dispatch<import("react").SetStateAction<string>>;
    capture: () => CurrentAction;
    run: (task: RemoteAction, refresh?: RemoteAction) => Promise<void>;
};
