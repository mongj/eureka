export interface BedrockProviderModule {
	streamBedrock: (...args: any[]) => unknown;
	streamSimpleBedrock: (...args: any[]) => unknown;
}

export declare const bedrockProviderModule: BedrockProviderModule;
