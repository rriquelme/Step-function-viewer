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
  // Last known container size, used to keep the view centered across resizes.
  private lastW = 0;
  private lastH = 0;
  private readonly resizeObserver?: ResizeObserver;

  constructor(
    private readonly svg: SVGSVGElement,
    private readonly group: SVGGElement,
  ) {
    svg.addEventListener('wheel', this.onWheel, { passive: false });
    svg.addEventListener('mousedown', this.onMouseDown);
    window.addEventListener('mousemove', this.onMouseMove);
    window.addEventListener('mouseup', this.onMouseUp);
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(this.onResize);
      this.resizeObserver.observe(svg);
    }
  }

  dispose(): void {
    this.svg.removeEventListener('wheel', this.onWheel);
    this.svg.removeEventListener('mousedown', this.onMouseDown);
    window.removeEventListener('mousemove', this.onMouseMove);
    window.removeEventListener('mouseup', this.onMouseUp);
    this.resizeObserver?.disconnect();
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
    this.lastW = rect.width;
    this.lastH = rect.height;
    this.apply();
  }

  /** On container resize, keep whatever was centered in view (don't jump away). */
  private readonly onResize = (): void => {
    const rect = this.svg.getBoundingClientRect();
    if (this.lastW > 0 && this.lastH > 0 && (rect.width !== this.lastW || rect.height !== this.lastH)) {
      const centerX = (this.lastW / 2 - this.tx) / this.scale;
      const centerY = (this.lastH / 2 - this.ty) / this.scale;
      this.tx = rect.width / 2 - centerX * this.scale;
      this.ty = rect.height / 2 - centerY * this.scale;
      this.apply();
    }
    this.lastW = rect.width;
    this.lastH = rect.height;
  };

  reset(): void {
    this.scale = 1;
    this.tx = 0;
    this.ty = 0;
    this.apply();
  }

  /** Pan so that the given graph-space point is centered (keeps current zoom). */
  centerOn(x: number, y: number): void {
    const rect = this.svg.getBoundingClientRect();
    this.tx = rect.width / 2 - x * this.scale;
    this.ty = rect.height / 2 - y * this.scale;
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
