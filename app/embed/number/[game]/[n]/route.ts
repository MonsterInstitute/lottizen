import { numberWidget, themeFrom } from "@/lib/embed";

/** GET /embed/number/{game}/{n}?theme=dark — iframe widget: one number's draw history. */
export function GET(req: Request, { params }: { params: { game: string; n: string } }) {
  return numberWidget(params.game, params.n, themeFrom(req));
}
