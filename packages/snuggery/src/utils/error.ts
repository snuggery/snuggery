export abstract class AbstractError extends Error {
  constructor(message: string) {
    super(message);

    this.name = new.target.name;
  }
}
