// Pan/zoom controller for the graph. Applies a translate+scale transform to the
// viewport group and persists it across re-renders (so highlighting a variable
// doesn't reset the user's view).
export interface Bounds {
  width: number;
  height: number;
}

const MIN_SCALE = 0.1;
const MAX_SCALE = 4;
const ZOOM_STEP = 1.2;

export class Viewport {
  private scale = 1;
  private tx = 0;
  private ty = 0;
  private panning = false;
  private startX = 0;
  private startY = 0;

  constructor(
    private readonly svg: SVGSVGElement,
    private readonly group: SVGGElement,
  ) {
    svg.addEventListener('wheel', this.onWheel, { passive: false });
    svg.addEventListener('mousedown', this.onMouseDown);
    window.addEventListener('mousemove', this.onMouseMove);
    window.addEventListener('mouseup', this.onMouseUp);
  }

  dispose(): void {
    this.svg.removeEventListener('wheel', this.onWheel);
    this.svg.removeEventListener('mousedown', this.onMouseDown);
    window.removeEventListener('mousemove', this.onMouseMove);
    window.removeEventListener('mouseup', this.onMouseUp);
  }

  /** Scale and center the graph to fit the current container. */
  fit(bounds: Bounds): void {
    const rect = this.svg.getBoundingClientRect();
    if (!bounds.width || !bounds.height || !rect.width || !rect.height) {
      this.reset();
      return;
    }
    const padding = 40;
    const scale = Math.min(
      (rect.width - padding) / bounds.width,
      (rect.height - padding) / bounds.height,
      MAX_SCALE,
    );
    this.scale = clamp(scale, MIN_SCALE, MAX_SCALE);
    this.tx = (rect.width - bounds.width * this.scale) / 2;
    this.ty = (rect.height - bounds.height * this.scale) / 2;
    this.apply();
  }

  reset(): void {
    this.scale = 1;
    this.tx = 0;
    this.ty = 0;
    this.apply();
  }

  zoomIn(): void {
    this.zoomAround(ZOOM_STEP, this.centerPoint());
  }

  zoomOut(): void {
    this.zoomAround(1 / ZOOM_STEP, this.centerPoint());
  }

  private centerPoint(): { x: number; y: number } {
    const rect = this.svg.getBoundingClientRect();
    return { x: rect.width / 2, y: rect.height / 2 };
  }

  private zoomAround(factor: number, point: { x: number; y: number }): void {
    const newScale = clamp(this.scale * factor, MIN_SCALE, MAX_SCALE);
    const ratio = newScale / this.scale;
    // Keep the point under the cursor fixed.
    this.tx = point.x - (point.x - this.tx) * ratio;
    this.ty = point.y - (point.y - this.ty) * ratio;
    this.scale = newScale;
    this.apply();
  }

  private apply(): void {
    this.group.setAttribute('transform', `translate(${this.tx}, ${this.ty}) scale(${this.scale})`);
  }

  private readonly onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    const rect = this.svg.getBoundingClientRect();
    const point = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    this.zoomAround(e.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP, point);
  };

  private readonly onMouseDown = (e: MouseEvent): void => {
    if (e.button !== 0) {
      return;
    }
    this.panning = true;
    this.startX = e.clientX - this.tx;
    this.startY = e.clientY - this.ty;
    this.svg.classList.add('panning');
  };

  private readonly onMouseMove = (e: MouseEvent): void => {
    if (!this.panning) {
      return;
    }
    this.tx = e.clientX - this.startX;
    this.ty = e.clientY - this.startY;
    this.apply();
  };

  private readonly onMouseUp = (): void => {
    this.panning = false;
    this.svg.classList.remove('panning');
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
