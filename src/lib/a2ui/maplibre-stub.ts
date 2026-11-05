/**
 * `@copilotkit/react-core/v2/generative-ui` has a peer dependency on
 * `maplibre-gl` for its standard Map component. MDE does not use that
 * standard component and does not ship a second map stack. Aliasing the peer
 * to this stub keeps the A2UI catalog buildable without adding a vulnerable,
 * unused 1 MB map runtime. If standard UI Map is ever adopted, replace this
 * with the real peer after checking its security advisory.
 */
export class Map {
  constructor() {
    throw new Error("MDE A2UI does not bundle maplibre-gl; use the MDE Google Maps components instead.");
  }
}

const maplibreStub = { Map };
export default maplibreStub;
