import type { Property } from '../property';
import { Component } from './component';

/** Fallback for an unrecognized container node in the semantic tree. */
export class GenericComponent extends Component {
  readonly type: string;

  constructor(type: string, props?: Map<string, Property<unknown>>, components?: Component[]) {
    super(props, components);
    this.type = type;
  }
}
