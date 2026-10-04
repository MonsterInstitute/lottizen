import { latestWidget, themeFrom } from "@/lib/embed";

/** GET /embed/latest/{game}?theme=dark — iframe widget: the latest winning numbers. */
export function GET(req: Request, { params }: { params: { game: string } }) {
  return latestWidget(params.game, themeFrom(req));
}
