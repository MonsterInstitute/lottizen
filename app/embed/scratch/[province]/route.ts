import { scratchWidget, themeFrom } from "@/lib/embed";

/** GET /embed/scratch/{province}?theme=dark — iframe widget: a province's top 3 scratch tickets by prize money left. */
export function GET(req: Request, { params }: { params: { province: string } }) {
  return scratchWidget(params.province, themeFrom(req));
}
