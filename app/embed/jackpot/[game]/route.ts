import { jackpotWidget, themeFrom } from "@/lib/embed";

/** GET /embed/jackpot/{game}?theme=dark — iframe widget: next draw and estimated jackpot. */
export function GET(req: Request, { params }: { params: { game: string } }) {
  return jackpotWidget(params.game, themeFrom(req));
}
