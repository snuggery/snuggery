import type {JsonPropertyPath, JsonValue} from "../types";

export const enum ChangeType {
	Add = "add",
	Delete = "delete",
	Modify = "modify",
}

export type Change =
	| {
			readonly type: ChangeType.Add;
			readonly path: JsonPropertyPath;
			readonly value: JsonValue;
	  }
	| {
			readonly type: ChangeType.Delete;
			readonly path: JsonPropertyPath;
			readonly oldValue: JsonValue;
	  }
	| {
			readonly type: ChangeType.Modify;
			readonly path: JsonPropertyPath;
			readonly value: JsonValue;
			readonly oldValue: JsonValue;
	  };
