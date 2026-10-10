"""The charity lotteries Lottizen tracks, and how to read each one.

Discovered 2026-10-10 from each lottery's own site (checkout page source,
"powered by" footers, the JSON its pages call). Names and URLs only — every
figure shown on the site is scraped from the lottery's own pages/API at run
time (scripts/scrape_charity.py), never typed in here.

Fields:
  id, name, kind (home | 5050 | catch_the_ace | raffle), phase,
  province (licensing, 2-letter) [+ provinces for multi-province licences],
  operator, team, platform + ref (how to read it), url, rules_url, buy_url,
  results_url, match (regex on event titles when a vendor tenant hosts
  several raffles).

buy_url is the lottery's own page, with no tracking parameters (AGCO: no
payment per ticket sold to anyone promoting an electronic raffle).
"""
from __future__ import annotations

PHASE1_HOME = [
    # ---- ELMS / Salesforce Commerce Cloud platform: rules pages ----
    dict(id="princess-margaret-home-lottery", name="Princess Margaret Home Lottery", kind="home", province="ON",
         operator="The Princess Margaret Cancer Foundation", platform="rules", url="https://www.princessmargaretlotto.com/",
         rules_url="https://www.princessmargaretlotto.com/rules-regulations.html",
         buy_url="https://www.princessmargaretlotto.com/checkout/tickets"),
    dict(id="calgary-hospital-home-lottery", name="Calgary Hospital Home Lottery", kind="home", province="AB",
         operator="Calgary Health Foundation", platform="rules", url="https://www.calgaryhospitalhomelottery.com/",
         rules_url="https://www.calgaryhospitalhomelottery.com/rules-and-regulations.html",
         buy_url="https://www.calgaryhospitalhomelottery.com/checkout/tickets"),
    dict(id="mighty-millions-lottery", name="Mighty Millions Lottery (Stollery)", kind="home", province="AB",
         operator="Stollery Children's Hospital Foundation", platform="rules", url="https://www.mightymillionslottery.com/",
         rules_url="https://www.mightymillionslottery.com/rules-and-regulations.html",
         buy_url="https://www.mightymillionslottery.com/checkout/tickets"),
    dict(id="saskatoon-hospital-home-lottery", name="Saskatoon Hospital Home Lottery", kind="home", province="SK",
         operator="Royal University Hospital, St. Paul's Hospital and City Hospital foundations", platform="rules",
         url="https://www.hospitalhomelottery.org/", rules_url="https://www.hospitalhomelottery.org/rules-and-regulations.html",
         buy_url="https://www.hospitalhomelottery.org/checkout/tickets"),
    dict(id="hospitals-of-regina-home-lottery", name="Hospitals of Regina Foundation Home Lottery", kind="home", province="SK",
         operator="Hospitals of Regina Foundation", platform="rules", url="https://www.hrfhomelottery.com/",
         rules_url="https://www.hrfhomelottery.com/rules-and-regulations.html",
         buy_url="https://www.hrfhomelottery.com/checkout/tickets"),
    dict(id="nb-hospital-home-lottery", name="New Brunswick Hospital Home Lottery", kind="home", province="NB",
         operator="Saint John Regional Hospital Foundation", platform="rules", url="https://www.nbhospitalhomelottery.com/",
         rules_url="https://www.nbhospitalhomelottery.com/en/rules-regulations.html",
         buy_url="https://www.nbhospitalhomelottery.com/checkout/tickets"),
    dict(id="qeii-home-lottery", name="QEII Home Lottery", kind="home", province="NS", operator="QEII Foundation",
         platform="rules", url="https://www.qe2homelottery.com/", rules_url="https://www.qe2homelottery.com/rules-regulations.html",
         buy_url="https://www.qe2homelottery.com/checkout/tickets"),
    dict(id="health-care-foundation-home-lottery", name="Health Care Foundation Home Lottery", kind="home", province="NL",
         operator="Health Care Foundation", platform="rules", url="https://www.hcfhomelottery.ca/",
         rules_url="https://www.hcfhomelottery.ca/rules-and-regulations.html", buy_url="https://www.hcfhomelottery.ca/"),
    # ---- Lottery Nexus ----
    dict(id="london-dream-lottery", name="Dream Lottery (London)", kind="home", province="ON",
         operator="London Health Sciences Foundation, Children's Health Foundation and St. Joseph's Health Care Foundation",
         platform="rules", url="https://www.dreamitwinit.ca/", rules_url="https://www.dreamitwinit.ca/rules-and-regulations/",
         buy_url="https://tickets.dreamitwinit.ca/", results_url="https://tickets.dreamitwinit.ca/winners"),
    dict(id="bluewater-health-dream-home", name="Bluewater Health Foundation Dream Home Lottery", kind="home", province="ON",
         operator="Bluewater Health Foundation", platform="rules", url="https://www.bwhfdreamhome.com/",
         rules_url="https://www.bwhfdreamhome.com/rules-of-play", buy_url="https://tickets.bwhfdreamhome.com/",
         results_url="https://tickets.bwhfdreamhome.com/winners"),
    dict(id="bc-childrens-hospital-dream-lottery", name="BC Children's Hospital Dream Lottery", kind="home", province="BC",
         operator="BC Children's Hospital Foundation", platform="rules", url="https://bcchildren.com/",
         rules_url="https://bcchildren.com/rules-of-play/", buy_url="https://tickets.bcchildren.com/",
         results_url="https://tickets.bcchildren.com/winners"),
    dict(id="vgh-millionaire-lottery", name="Millionaire Lottery (VGH & UBC Hospital Foundation)", kind="home", province="BC",
         operator="VGH & UBC Hospital Foundation", platform="rules", url="https://millionairelottery.com/",
         rules_url="https://millionairelottery.com/rules-of-play/", buy_url="https://tickets.millionairelottery.com/",
         results_url="https://tickets.millionairelottery.com/winners"),
    dict(id="pne-prize-home-lottery", name="PNE Prize Home Lottery", kind="home", province="BC",
         operator="Pacific National Exhibition", platform="rules", url="https://pneprizehome.ca/",
         rules_url="https://pneprizehome.ca/info/rules-regulations/", buy_url="https://tickets.pnelottery.ca/"),
    dict(id="spruce-kings-show-home-lottery", name="Prince George Spruce Kings Show Home Lottery", kind="home", province="BC",
         operator="Prince George Spruce Kings", platform="rules", url="https://www.sprucekingsshowhome.ca/",
         rules_url="https://www.sprucekingsshowhome.ca/rules", buy_url="https://www.sprucekingsshowhome.ca/"),
    dict(id="oil-barons-dream-home", name="Oil Barons Dream Home Lottery", kind="home", province="AB",
         operator="Fort McMurray Oil Barons", platform="rules", url="https://www.oilbaronsdreamhome.ca/",
         rules_url="https://www.oilbaronsdreamhome.ca/", buy_url="https://tickets.oilbaronsdreamhome.ca/"),
    # ---- Stride (SMC checkout API) ----
    dict(id="alberta-childrens-hospital-lottery", name="Alberta Children's Hospital Lottery", kind="home", province="AB",
         operator="Alberta Children's Hospital Foundation", platform="stride", ref="72d70d40-f1bc-4be6-0dcc-08d7bae74781",
         url="https://childrenshospitallottery.ca/", rules_url="https://childrenshospitallottery.ca/rules/",
         buy_url="https://checkout.childrenshospitallottery.ca/"),
    dict(id="red-deer-hospital-lottery", name="Red Deer Hospital Lottery", kind="home", province="AB",
         operator="Red Deer Regional Health Foundation", platform="stride", ref="aff508f6-dd57-4473-0dca-08d7bae74781",
         url="https://reddeerhospitallottery.ca/", rules_url="https://reddeerhospitallottery.ca/rules/",
         buy_url="https://rdhosp.smccheckout.com/"),
    dict(id="stars-lottery-alberta", name="STARS Lottery Alberta", kind="home", province="AB", operator="STARS",
         platform="stride", ref="4e0989dd-b69f-4da7-0dd1-08d7bae74781", url="https://ab.starslottery.ca/",
         rules_url="https://ab.starslottery.ca/contest-rules", buy_url="https://starsab.smccheckout.com/"),
    dict(id="calgary-stampede-rotary-dream-home", name="Calgary Stampede Rotary Dream Home", kind="home", province="AB",
         operator="Calgary Stampede Foundation and Rotary", platform="stride", ref="89b36de4-f377-46a0-0dcb-08d7bae74781",
         url="https://calgarystampedelotteries.ca/", rules_url="https://calgarystampedelotteries.ca/rules",
         buy_url="https://stamp.smccheckout.com/"),
    # ---- Manitoba shared platform: rules pages ----
    dict(id="hsc-millionaire-lottery", name="HSC Millionaire Lottery", kind="home", province="MB", operator="HSC Foundation",
         platform="rules", url="https://hscmillionaire.com/", rules_url="https://hscmillionaire.com/rules-of-play/",
         buy_url="https://purchase.hscmillionaire.com/ticket-order/step-one"),
    dict(id="st-boniface-mega-million-choices", name="St-Boniface Mega Million Choices", kind="home", province="MB",
         operator="St. Boniface Hospital Foundation", platform="rules", url="https://stbmegamillionchoices.ca/",
         rules_url="https://stbmegamillionchoices.ca/rules-of-play/", buy_url="https://stbmegamillionchoices.ca/"),
    dict(id="tri-hospital-dream-lottery", name="Tri-Hospital Dream Lottery", kind="home", province="MB",
         operator="Tri-Hospital (Winnipeg)", platform="rules", url="https://trihospitaldream.com/",
         rules_url="https://trihospitaldream.com/rules-of-play/", buy_url="https://trihospitaldream.com/"),
    # ---- BUMP (home) ----
    dict(id="cheo-dream-of-a-lifetime", name="CHEO Dream of a Lifetime Lottery", kind="home", province="ON",
         operator="CHEO Foundation", platform="bump-home", ref="cheofoundation.ca-api", url="https://dreamofalifetime.ca/",
         rules_url="https://dreamofalifetime.ca/pages/rules", buy_url="https://dreamofalifetime.ca/"),
    dict(id="maison-enfant-soleil", name="Tirage Maison Enfant Soleil", kind="home", province="QC",
         operator="Opération Enfant Soleil", platform="bump-home", ref="maisonenfantsoleil.ca-api",
         url="https://www.enfantsoleil.ca/tirages/maison-enfant-soleil",
         rules_url="https://maisonenfantsoleil.enfantsoleil.ca/pages/reglements",
         buy_url="https://maisonenfantsoleil.enfantsoleil.ca/"),
    # ---- In-house ----
    dict(id="chha-nl-ultimate-dream-home", name="CHHA-NL Ultimate Dream Home Lottery", kind="home", province="NL",
         operator="Canadian Hard of Hearing Association – Newfoundland and Labrador", platform="rules",
         url="https://ultimatedreamhomelottery.com/", rules_url="https://ultimatedreamhomelottery.com/",
         buy_url="https://ultimatedreamhomelottery.com/"),
    dict(id="grande-prairie-rotary-dream-home", name="Rotary Clubs of Grande Prairie Dream Home", kind="home", province="AB",
         operator="Rotary Clubs of Grande Prairie", platform="rules", url="https://winadreamhome.ca/",
         rules_url="https://winadreamhome.ca/tickets/rules-regulations/", buy_url="https://winadreamhome.ca/"),
    # ---- Cash grand prize charity lotteries (not homes) on the same platforms ----
    dict(id="heart-and-stroke-lottery", name="Heart & Stroke Lottery", kind="raffle", province="ON",
         operator="Heart and Stroke Foundation", platform="rules", url="https://www.heartandstrokelottery.ca/",
         rules_url="https://www.heartandstrokelottery.ca/rules", buy_url="https://order.heartandstrokelottery.ca/"),
    dict(id="sickkids-lottery", name="SickKids Lottery", kind="raffle", province="ON", operator="SickKids Foundation",
         platform="rules", url="https://www.sickkidslottery.ca/", rules_url="https://www.sickkidslottery.ca/rules-and-regulations",
         buy_url="https://order.sickkidslottery.ca/"),
    dict(id="riders-childrens-hospital-lottery", name="Roughrider & Children's Hospital Foundations Lottery", kind="raffle",
         province="SK", operator="Jim Pattison Children's Hospital Foundation", platform="rules",
         url="https://www.riderschildrenslottery.ca/", rules_url="https://www.riderschildrenslottery.ca/rules",
         buy_url="https://www.riderschildrenslottery.ca/"),
]


def _b(id, name, team, province, tenant, url, results=None, match=None, operator=None, provinces=None, phase=1):
    return dict(id=id, name=name, kind="5050", phase=phase, province=province, provinces=provinces, operator=operator,
                team=team, platform="bump", ref=tenant, url=url, buy_url=url, results_url=results, match=match)


def _a(id, name, team, province, base, url, operator=None, phase=1, kind="5050", match=None):
    return dict(id=id, name=name, kind=kind, phase=phase, province=province, operator=operator, team=team,
                platform="ascend", ref=base, url=url, buy_url=url, results_url=url, match=match)


ASC_PUB = "https://public-raffles.ca-4.ascendfs.net/rest/v1/"
ASC_PRD = "https://prd-guillotine-api-cacentral1-post8000.5050central.com/rest/v1/"

PHASE1_5050 = [
    # NHL
    _b("maple-leafs-5050", "Leafs 50/50", "Toronto Maple Leafs", "ON", "scotiabank.ca-api", "https://5050.mapleleafs.com/",
       match=r"(?i)leafs", operator="MLSE Foundation"),
    _b("canadiens-5050", "Canadiens 50/50", "Montréal Canadiens", "QC", "montrealcanadiens.ca2-api",
       "https://5050.canadiens.com/", "https://5050.canadiens.com/pages/gagnants",
       operator="Fondation des Canadiens pour l'enfance"),
    _b("senators-5050", "Sens 50/50", "Ottawa Senators", "ON", "osenators.ca-api", "https://5050sens.com/",
       "https://5050sens.com/pages/winning-numbers-1", operator="Senators Community Foundation"),
    _b("jets-5050", "Winnipeg Jets 50/50", "Winnipeg Jets", "MB", "winnipegjets.ca-api", "https://winnipegjets5050.ca/",
       "https://winnipegjets5050.ca/pages/winning-numbers", operator="True North Youth Foundation"),
    _b("flames-5050", "Calgary Flames Foundation 50/50", "Calgary Flames", "AB", "saddledome.ca-api",
       "https://5050flames.com/", "https://5050flames.com/pages/winners", operator="Calgary Flames Foundation"),
    _b("oilers-5050", "Oilers 50/50", "Edmonton Oilers", "AB", "edmontonoilers.ca-api",
       "https://www.nhl.com/oilers/community/5050-landing", "https://www.nhl.com/oilers/community/5050-winning-numbers",
       match=r"(?i)oilers", operator="Edmonton Oilers Community Foundation"),
    _a("canucks-5050", "Canucks 50/50", "Vancouver Canucks", "BC", ASC_PRD + "vancouvercanucksraffle.5050central.com",
       "https://vancouvercanucks5050.com/", operator="Canucks for Kids Fund"),
    # MLB / NBA / MLS
    _b("jays-care-5050", "Jays Care 50/50", "Toronto Blue Jays", "ON", "jayscare.ca-api", "https://jayscare5050.com/",
       "https://jayscare5050.com/pages/winners", operator="Jays Care Foundation", provinces=["ON", "AB", "NS", "NB", "PE"]),
    _b("raptors-5050", "Raptors 50/50", "Toronto Raptors", "ON", "scotiabank.ca-api", "https://5050.raptors.com/",
       "https://5050.raptors.com/pages/winning-numbers", match=r"(?i)raptors", operator="MLSE Foundation"),
    _b("tfc-5050", "TFC 50/50", "Toronto FC", "ON", "bmofield.ca-api", "https://5050.torontofc.ca/",
       "https://5050.torontofc.ca/pages/winning-numbers", match=r"(?i)tfc|toronto fc", operator="MLSE Foundation"),
    _b("cf-montreal-5050", "CF Montréal 50/50", "CF Montréal", "QC", "cfmontreal.ca-api",
       "https://5050.fondationimpactdemontreal.com/", operator="Fondation de l'Impact de Montréal"),
    _b("whitecaps-foundation-5050", "Whitecaps Foundation 50/50", "Vancouver Whitecaps FC", "BC", "whitecaps.ca-api",
       "https://whitecapsfc5050.com/", operator="Whitecaps FC Foundation"),
    # CFL
    _a("bc-lions-5050", "BC Lions 50/50", "BC Lions", "BC", ASC_PUB + "bclionsraffle.5050central.com",
       "https://bclions5050.com/"),
    _b("stampeders-5050", "Stampeders Foundation 50/50", "Calgary Stampeders", "AB", "cstamps.ca-api",
       "https://5050stamps.com/", operator="Calgary Stampeders Foundation"),
    _b("elks-5050", "Edmonton Elks 50/50", "Edmonton Elks", "AB", "goelks.ca-api", "https://50-50.goelks.ca/",
       "https://50-50.goelks.ca/pages/winning-numbers"),
    dict(id="roughriders-5050", name="Saskatchewan Roughrider Foundation 50/50", kind="5050", phase=1, province="SK",
         team="Saskatchewan Roughriders", operator="Saskatchewan Roughrider Foundation", platform="tap", ref="611",
         url="https://www.riders5050.ca/", buy_url="https://www.riders5050.ca/", results_url="https://www.riders5050.ca/winners"),
    _a("blue-bombers-5050", "Blue Bombers 50/50", "Winnipeg Blue Bombers", "MB",
       ASC_PRD + "winnipegbluebombersraffle.5050central.com", "https://bluebombers5050.com/"),
    _a("tiger-cats-5050", "Tiger-Cats & Forge FC 50/50", "Hamilton Tiger-Cats", "ON",
       ASC_PUB + "ticatsraffle.5050central.com", "https://ticats5050.com/", operator="Hamilton Sports Group Foundation"),
    _b("argonauts-5050", "Argonauts 50/50", "Toronto Argonauts", "ON", "bmofield.ca-api", "https://5050.argonauts.ca/",
       match=r"(?i)argo", operator="MLSE Foundation"),
    _b("redblacks-5050", "REDBLACKS 50/50", "Ottawa REDBLACKS", "ON", "osegfoundation.ca-api", "https://redblacks5050.com/",
       "https://redblacks5050.com/pages/winning-numbers", match=r"(?i)redblacks", operator="OSEG Foundation"),
    _b("alouettes-5050", "Alouettes 50/50", "Montréal Alouettes", "QC", "montrealalouettes.ca-api",
       "https://montrealalouettes.ca.bumpcbnraffle.com/", operator="Fondation des Alouettes de Montréal"),
    # National
    _b("hockey-canada-5050", "Hockey Canada Foundation 50/50 (Canada's Ultimate 50/50)", "Team Canada", "NS",
       "hockeycanadafoundation.ca-api", "https://www.hockeycanada5050.ca/",
       "https://www.hockeycanada5050.ca/pages/winning-numbers", operator="Hockey Canada Foundation"),
    # Blue Bombers Chase the Ace
    _a("blue-bombers-chase-the-ace", "Blue Bombers Chase the Ace", "Winnipeg Blue Bombers", "MB",
       ASC_PUB + "bluebombersraffle.5050central.com", "https://bluebombers5050.com/", kind="catch_the_ace", phase=2, match=r"(?i)\bace\b"),
]

# Junior / AHL team 50/50s on the same vendors (phase 2).
PHASE2_5050 = [
    _b("hitmen-5050", "Calgary Hitmen 50/50", "Calgary Hitmen", "AB", "calgaryhitmen.ca-api", "https://5050hitmen.com/", phase=2),
    _b("oil-kings-5050", "Edmonton Oil Kings 50/50", "Edmonton Oil Kings", "AB", "edmontonoilkings.ca-api",
       "https://edmontonoilkings5050.myshopify.com/", phase=2),
    _b("rebels-5050", "Red Deer Rebels 50/50", "Red Deer Rebels", "AB", "reddeerrebels.ca-api", "https://rebels5050.com/", phase=2),
    _b("rangers-reach-5050", "Kitchener Rangers 50/50", "Kitchener Rangers", "ON", "rangersreach.ca-api",
       "https://rangers5050.com/", phase=2),
    _b("laval-rocket-5050", "Rocket de Laval 50/50", "Laval Rocket", "QC", "lavalrockets.ca-api", "https://5050.rocketlaval.com/", phase=2),
    _b("ottawa-67s-5050", "Ottawa 67's 50/50", "Ottawa 67's", "ON", "osegfoundation.ca-api", "https://redblacks5050.com/",
       match=r"(?i)67", phase=2),
    _b("manitoba-moose-5050", "Manitoba Moose 50/50", "Manitoba Moose", "MB", "winnipegjets.ca-api",
       "https://winnipegjets5050.ca/", match=r"(?i)moose", phase=2),
    _a("abbotsford-canucks-5050", "Abbotsford Canucks 50/50", "Abbotsford Canucks", "BC",
       ASC_PRD + "abbotsfordcanucksraffle.5050central.com", "https://abbotsfordcanucks5050.com/", phase=2),
    _a("vancouver-giants-5050", "Vancouver Giants 50/50", "Vancouver Giants", "BC",
       ASC_PUB + "langleyfacilitiessocietyraffle.5050central.com", "https://giants5050.com/", phase=2),
    _a("kelowna-rockets-5050", "Kelowna Rockets 50/50", "Kelowna Rockets", "BC",
       ASC_PUB + "kelownarocketsraffle.5050central.com", "https://rockets5050.com/", phase=2),
    _a("brandon-wheat-kings-5050", "Brandon Wheat Kings 50/50", "Brandon Wheat Kings", "MB",
       ASC_PUB + "wheatkingsraffle.5050central.com", "https://wheatkings5050.com/", phase=2),
    _a("london-knights-5050", "London Knights 50/50", "London Knights", "ON",
       ASC_PUB + "londonknightsraffle.5050central.com", "https://knights5050.com/", phase=2),
    _a("barrie-colts-5050", "Barrie Colts 50/50", "Barrie Colts", "ON", ASC_PUB + "barriecoltsraffle.5050central.com",
       "https://colts5050.com/", phase=2),
    _a("oshawa-generals-5050", "Oshawa Generals 50/50", "Oshawa Generals", "ON", ASC_PUB + "generalsraffle.5050central.com",
       "https://gens5050.com/", phase=2),
    _a("windsor-spitfires-5050", "Windsor Spitfires 50/50", "Windsor Spitfires", "ON",
       ASC_PUB + "windsorspitfiresraffle.5050central.com", "https://spits5050.com/", phase=2),
    _a("kidsport-bc-whitecaps-5050", "KidSport BC Whitecaps 50/50", None, "BC", ASC_PUB + "kidsportbcraffle.5050central.com",
       "https://whitecaps5050.com/", operator="KidSport BC", phase=2),
    _a("rogers-arena-5050", "Rogers Arena 50/50", None, "BC", ASC_PRD + "canucksraffle.5050central.com",
       "https://rogersarena5050.com/", operator="Canucks for Kids Fund", phase=2),
]

LOTTERIES = PHASE1_HOME + PHASE1_5050 + PHASE2_5050
