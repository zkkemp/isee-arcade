export type LowerLevelFlashcardDetail = {
  synonyms: string[];
  definition: string;
  example: string;
};

/**
 * Child-readable learning support for every word in the supplied 200-word deck.
 * Each row stays on the exact sense used by the source card, especially for
 * words such as appeal, current, dock, level, and objective that have several
 * unrelated meanings.
 */
const DETAIL_ROWS = `
ambition|goal,aspiration,aim|a strong desire to achieve something|Her ambition is to design a robot that can clean the ocean.
avoid|shun,evade,escape|to stay away from someone or something|We avoid the muddy path after a heavy rain.
apparent|obvious,evident,clear|easy to notice or understand|It became apparent that the small box was too heavy to lift alone.
appeal|request,plea,petition|a serious request for help or change|The students made an appeal for more books in the library.
approximate|estimate,judge,calculate|to make a close guess about an amount|We can approximate the crowd by counting the rows of seats.
arise|emerge,appear,occur|to begin or come into being|New questions may arise when we study the strange fossil.
assert|declare,state,insist|to say something firmly and confidently|Maya will assert her idea even when others disagree.
assess|evaluate,judge,measure|to examine something and decide its value or condition|The coach will assess each player before choosing the team.
assist|help,aid,support|to help someone complete a task|Two volunteers assist the teacher during the science fair.
astound|amaze,astonish,surprise|to surprise someone greatly|The magician’s final trick will astound the audience.
attest|prove,confirm,verify|to show or say that something is true|The muddy pawprints attest that the dog entered the kitchen.
authority|power,control,command|the right or power to make decisions|The referee has the authority to stop the game.
beneficial|helpful,useful,advantageous|producing a good or helpful result|Daily reading is beneficial because it builds vocabulary.
bountiful|plentiful,abundant,generous|available in a large amount|The garden produced a bountiful harvest of tomatoes.
channel|guide,direct,funnel|to guide something toward a particular place or purpose|The stone walls channel rainwater away from the house.
chaos|disorder,confusion,turmoil|a state of complete confusion and disorder|The spilled box of puppies created cheerful chaos in the room.
characteristic|feature,trait,quality|a typical feature that helps identify something|A long neck is a characteristic of a giraffe.
chronic|persistent,long-standing,long-term|continuing for a long time or returning often|The old roof had a chronic leak whenever it rained.
clarity|clearness,precision,lucidity|the quality of being easy to see or understand|The diagram added clarity to the complicated directions.
commotion|uproar,disturbance,bustle|noisy confusion or excitement|A commotion began when the balloons escaped into the gym.
compensate|repay,reimburse,reward|to give something in return for a loss or effort|The store will compensate us for the damaged package.
complement|complete,enhance,balance|to add something that makes another thing better or more complete|The bright scarf will complement her blue coat.
compose|create,write,form|to create a piece of writing or music|Luis will compose a short song for the school concert.
conceal|hide,cover,disguise|to keep something from being seen or known|Tall grass can conceal a rabbit from a hawk.
concept|idea,notion,principle|a general idea used to understand something|Place value is an important math concept.
confirm|verify,prove,validate|to show that something is true or correct|The second measurement will confirm the table’s length.
consent|permit,agree,approve|to give permission or agreement|Her parents consent to the field trip after reading the plan.
contagious|infectious,catching,communicable|able to spread from one person to another|A contagious illness can travel quickly through a classroom.
contemporary|modern,current,present-day|belonging to the present time|The museum displays contemporary art made by living artists.
contribute|donate,give,supply|to give something toward a shared purpose|Each student will contribute one idea to the class project.
counsel|advise,guide,recommend|to give someone thoughtful advice|The nurse will counsel families about healthy meals.
crucial|important,essential,vital|extremely important to success|Clean water is crucial for every living thing.
current|present,existing,ongoing|happening or existing now|The current schedule gives us ten minutes for lunch.
dank|damp,clammy,musty|unpleasantly damp and often chilly|The basement felt dank after water leaked through the wall.
decline|decrease,lessen,drop|to become smaller or weaker|The temperature will decline after the sun sets.
deceit|deception,dishonesty,trickery|behavior meant to make someone believe something false|The story’s villain used deceit to steal the treasure map.
devastate|destroy,ruin,wreck|to damage something very badly|A powerful storm can devastate homes near the shore.
dedicate|commit,devote,pledge|to give time or effort to a purpose|Nora will dedicate an hour each day to piano practice.
deficient|lacking,inadequate,insufficient|not having enough of something necessary|The plant became weak because the soil was deficient in nutrients.
demolish|destroy,tear down,flatten|to completely tear down or destroy|The crew will demolish the unsafe building.
deprive|deny,withhold,strip|to prevent someone from having something needed or wanted|A thick curtain can deprive the seedlings of sunlight.
detrimental|harmful,damaging,unfavorable|causing harm or damage|Too little sleep is detrimental to concentration.
devotion|loyalty,dedication,commitment|strong love or steady commitment|Her devotion to the injured bird helped it recover.
dispute|argue,challenge,contest|to disagree strongly about something|The teams dispute whether the ball crossed the line.
distort|twist,warp,misrepresent|to change something so it is no longer accurate or true|A curved mirror can distort your reflection.
dismay|alarm,distress,disappointment|a feeling of worry or disappointment|To our dismay, the picnic was canceled by rain.
diversity|variety,range,difference|the presence of many different kinds|The reef supports a great diversity of sea life.
docile|obedient,gentle,manageable|calm and easy to guide or control|The docile pony stood quietly while the child brushed it.
dock|anchor,moor,berth|to bring a boat to a landing place and secure it|We will dock the canoe beside the wooden pier.
donate|give,contribute,present|to give something to help a person or cause|Our class will donate coats to the winter clothing drive.
drizzle|sprinkle,mist,shower|to rain in very small light drops|It began to drizzle while we walked home.
dwindle|diminish,shrink,decrease|to gradually become smaller or fewer|Our snack supply began to dwindle during the long hike.
effect|result,outcome,consequence|a change that happens because of something else|One effect of the cold night was ice on the pond.
effective|successful,useful,powerful|producing the intended result|The new study plan was effective and improved her score.
elevate|raise,lift,heighten|to move something to a higher position|Use the crank to elevate the platform.
elongate|lengthen,extend,stretch|to make something longer|Pulling the soft clay will elongate its shape.
emaciated|skeletal,gaunt,extremely thin|abnormally thin because of hunger or illness|The rescued dog was emaciated but grew stronger with care.
embark|begin,start,commence|to begin a journey or new activity|The explorers embark on their voyage at sunrise.
empower|authorize,enable,permit|to give someone power or confidence to act|Good tools empower students to test their own ideas.
encompass|surround,include,contain|to include or surround something completely|The park will encompass forests ponds and walking trails.
enhance|improve,strengthen,enrich|to make something better or more effective|Adding labels will enhance the science display.
enlist|recruit,enroll,engage|to persuade someone to join or help|We will enlist our neighbors to clean the playground.
enrich|improve,enhance,develop|to make something better or more meaningful|Travel can enrich our understanding of other cultures.
enthusiasm|excitement,eagerness,zeal|strong interest and eager enjoyment|Her enthusiasm for astronomy inspired the whole class.
entirety|whole,total,completeness|the complete amount with no part missing|We watched the eclipse in its entirety.
escalate|intensify,increase,worsen|to become more serious or intense|A small argument can escalate if no one listens.
exhaust|deplete,drain,use up|to use all or nearly all of a supply|The long climb will exhaust our supply of water.
facade|front,appearance,exterior|the outward face or appearance of something|The theater’s stone facade looks older than the building inside.
falter|hesitate,waver,stumble|to lose confidence strength or steadiness|Her voice began to falter during the difficult speech.
farce|mockery,sham,absurdity|a situation so foolish that it seems fake or ridiculous|The disorganized contest became a farce when no one knew the rules.
fathom|understand,grasp,comprehend|to understand something difficult|I cannot fathom how the tiny ant carried such a large crumb.
finalize|complete,finish,settle|to make the final decisions and complete something|We will finalize the poster after checking every fact.
flattery|praise,compliments,sweet talk|praise given to please or influence someone|He used flattery to persuade his sister to share her dessert.
flicker|glimmer,waver,flutter|to shine or move with quick unsteady changes|The candle flame began to flicker in the breeze.
fluctuate|vary,change,shift|to rise and fall or change repeatedly|Gas prices can fluctuate from week to week.
forage|search,hunt,scavenge|to search widely for food or supplies|Squirrels forage for nuts beneath the oak trees.
forgo|give up,waive,go without|to choose not to have or do something|I will forgo dessert so we can leave on time.
fragment|piece,part,shard|a small broken-off part of something|The scientist found a pottery fragment in the soil.
frenzy|excitement,uproar,commotion|a state of wild or uncontrolled activity|The surprise announcement sent the crowd into a frenzy.
friction|resistance,rubbing,conflict|resistance created when surfaces rub together|Friction between the tires and road helps the bicycle stop.
frigid|freezing,icy,bitterly cold|extremely cold|A frigid wind swept across the frozen lake.
frivolous|trivial,silly,unimportant|not serious useful or important|Buying another toy seemed frivolous when he was saving for a bike.
fugitive|runaway,escapee,person in hiding|a person who is running away to avoid capture|The fugitive hid in an empty shed while police searched nearby.
fundamental|basic,essential,central|forming a necessary or important base|Knowing letter sounds is fundamental to learning to read.
fury|rage,anger,wrath|extreme and often uncontrolled anger|The unfair accusation filled him with fury.
glare|scowl,stare,glower|to look at someone with an angry fixed expression|She began to glare at the player who had cheated.
gleam|shine,glow,glimmer|to shine with a small bright light|Clean silver will gleam under the kitchen light.
glean|gather,collect,learn|to collect information or small amounts bit by bit|We can glean clues about the past from old letters.
hazard|danger,risk,threat|something that may cause harm|Loose wires are a serious safety hazard.
humble|modest,unassuming,meek|not proud or boastful|Although she won the prize she remained humble.
humid|damp,moist,muggy|containing a lot of moisture in the air|The humid air made every shirt feel sticky.
ideal|perfect,best,excellent|as good as possible for a purpose|A sunny calm day is ideal for the class picnic.
ignorant|unaware,uninformed,unknowing|lacking knowledge about something|I was ignorant of the rule until the referee explained it.
illogical|unreasonable,irrational,senseless|not based on clear or sensible reasoning|It is illogical to expect ice to stay frozen in a hot car.
illuminate|brighten,light,reveal|to light something up or make it clearer|A flashlight will illuminate the dark cave wall.
immaculate|spotless,pristine,clean|perfectly clean and neat|The kitchen was immaculate after everyone helped scrub it.
immense|enormous,vast,huge|extremely large|An immense whale surfaced beside the boat.
immerse|submerge,dip,plunge|to put something completely into a liquid or activity|Immerse the jar in warm water to loosen the lid.
impersonate|imitate,mimic,portray|to pretend to be another person|The comedian can impersonate the principal’s cheerful voice.
implement|carry out,apply,execute|to put a plan or decision into action|The school will implement the new recycling plan next month.
impression|belief,idea,feeling|an idea or feeling formed from what you notice|I had the impression that the store was already closed.
incandescent|glowing,radiant,luminous|giving off bright light especially from heat|The incandescent metal glowed orange in the forge.
industrious|hardworking,diligent,busy|working steadily and carefully|The industrious ants carried food throughout the afternoon.
infer|conclude,deduce,reason|to reach an answer using evidence rather than a direct statement|From the wet sidewalk we can infer that it recently rained.
innovate|invent,pioneer,create|to introduce a new idea or method|Engineers innovate when they design safer batteries.
insight|understanding,awareness,perception|a clear and deep understanding|Her journal gave us insight into life on the farm.
integrate|combine,unite,blend|to join parts into one whole|We will integrate the new students into the class team.
intuitive|instinctive,natural,automatic|understood or done naturally without careful reasoning|The simple controls felt intuitive after one try.
irate|angry,furious,enraged|extremely angry|The irate customer demanded a refund for the broken lamp.
jagged|uneven,rough,sharp-edged|having rough sharp points or edges|We stepped carefully around the jagged rocks.
jumble|mishmash,mixture,mess|a confused mixture of things|The drawer held a jumble of buttons strings and coins.
lack|shortage,absence,scarcity|a condition of not having enough|A lack of rain caused the pond to shrink.
kin|relative,family,relation|a person related to someone by family|All of our kin gathered for the reunion.
level|even,flat,horizontal|having a surface that does not slope|Make sure the shelf is level before attaching it to the wall.
liberate|free,release,emancipate|to set someone or something free|The rescuers will liberate the turtle from the plastic net.
lunacy|foolishness,madness,insanity|extremely foolish or wild behavior|Trying to cross the flooded bridge would be lunacy.
lush|abundant,rich,thick|growing thickly and healthily|The valley was covered in lush green grass.
luxury|extravagance,comfort,indulgence|something costly and pleasant but not necessary|A heated pool felt like a luxury during the cold winter.
malicious|harmful,spiteful,cruel|intended to hurt or upset someone|The malicious rumor damaged an innocent student’s reputation.
mar|damage,spoil,scar|to harm the appearance or quality of something|A deep scratch can mar the polished table.
marginal|slight,minor,small|very small in amount or importance|The second design showed only marginal improvement.
meld|merge,blend,combine|to join together into one|The musicians meld jazz and folk music in the new song.
mentor|adviser,teacher,guide|an experienced person who guides someone less experienced|Her mentor helped her prepare for the robotics contest.
method|procedure,system,way|an organized way of doing something|Our teacher showed us a quick method for checking division.
mischief|trouble,naughtiness,pranks|playful behavior that causes minor trouble|The puppy got into mischief and scattered socks everywhere.
modify|change,adjust,alter|to make a small change to something|We must modify the ramp so the cart moves more slowly.
monitor|observe,watch,track|to watch something carefully over time|Scientists monitor the river to detect pollution.
mound|heap,pile,hill|a raised pile of earth or other material|The mole left a small mound of soil beside the path.
moral|ethical,right,virtuous|following accepted ideas about right and wrong|Returning the lost wallet was the moral choice.
mortal|human,person,human being|a human being who cannot live forever|In the myth no ordinary mortal could lift the enchanted stone.
muted|softened,quieted,subdued|made quieter or less strong|Muted colors made the room feel calm.
narrate|describe,recount,tell|to tell a story or describe events|A student will narrate the video about our field trip.
nourish|feed,sustain,nurture|to provide what is needed for growth and health|Healthy soil will nourish the young plants.
nutritive|nourishing,healthful,sustaining|providing substances needed for growth and health|Beans are nutritive because they provide protein and fiber.
objective|goal,aim,purpose|something a person is trying to achieve|Our main objective is to finish the experiment safely.
omit|exclude,skip,leave out|to leave something out|Do not omit your name from the top of the page.
optimum|best,ideal,most favorable|the best or most effective possible|Seeds grow at an optimum temperature that is warm but not hot.
perplexed|confused,puzzled,baffled|unable to understand something|I felt perplexed by the map until I found the legend.
persist|continue,endure,persevere|to keep going despite difficulty|If you persist with practice the difficult song will become easier.
plume|feather,quill,crest|a large showy feather or group of feathers|A bright plume rose from the peacock’s tail.
portion|part,share,section|a part of a larger whole|She saved a portion of her lunch for later.
portly|stout,plump,heavyset|having a round and somewhat heavy body|The portly actor wore a broad red coat.
postpone|delay,defer,put off|to move an event to a later time|Rain may postpone the baseball game until Saturday.
practical|useful,sensible,realistic|suited to real needs and likely to work|Packing a flashlight was a practical choice for the camping trip.
precise|exact,accurate,specific|careful and exact|The recipe requires a precise amount of salt.
profound|deep,meaningful,intense|very great or deeply felt|The speech had a profound effect on the audience.
propose|suggest,recommend,present|to put forward an idea for consideration|I propose that we plant flowers beside the playground.
puzzled|confused,baffled,uncertain|unable to understand or solve something|The strange footprint left the hikers puzzled.
pursue|chase,follow,seek|to follow or work toward something|She hopes to pursue a career in medicine.
quantity|amount,number,total|how much or how many there is of something|The recipe needs a small quantity of sugar.
radiate|emit,give off,spread|to send out energy light heat or feeling|Warmth will radiate from the campfire.
realization|awareness,understanding,recognition|the moment of becoming aware of something|The realization that we were lost made everyone stop and check the map.
reassure|comfort,encourage,calm|to make someone feel less worried|The doctor will reassure the child before the test.
reasonable|fair,sensible,logical|fair and based on good sense|Asking for one more day was a reasonable request.
reconsider|rethink,review,reevaluate|to think again about a decision|We may reconsider the picnic if the storm passes.
recreation|amusement,leisure,play|an activity done for enjoyment|Swimming is her favorite form of recreation.
recur|repeat,return,happen again|to happen again|The same problem may recur unless we repair the pipe.
remote|distant,faraway,isolated|far from towns people or activity|The research station stands in a remote part of the desert.
repel|drive away,push back,ward off|to force something away or keep it from approaching|The strong scent may repel mosquitoes.
resemble|look like,match,mirror|to be similar in appearance or qualities|The cloud seemed to resemble a giant ship.
reside|live,dwell,stay|to live in a particular place|Many owls reside in the old forest.
resonate|echo,reverberate,ring|to produce or be filled with a deep continuing sound|The drumbeat will resonate through the empty hall.
restrict|limit,confine,reduce|to place a limit on something|The fence will restrict the dog to the backyard.
retain|keep,preserve,hold|to continue to have or remember something|The soil can retain water after a gentle rain.
robust|strong,sturdy,vigorous|strong healthy and able to handle difficulty|The robust bridge survived the heavy storm.
salvage|save,recover,rescue|to save something from loss or damage|We managed to salvage several books after the leak.
satisfy|please,fulfill,meet|to meet a need or make someone content|A warm meal will satisfy the hungry hikers.
saturate|soak,drench,fill|to make completely wet or filled|Heavy rain can saturate the ground.
sensible|reasonable,practical,wise|showing good judgment|Wearing a helmet is a sensible safety choice.
scorn|mock,ridicule,despise|to treat someone or something with strong disrespect|It is unkind to scorn another person’s honest effort.
sedated|calm,tranquilized,subdued|made calm or sleepy with medicine|The sedated animal rested quietly during the examination.
skeptical|doubtful,unconvinced,questioning|not easily convinced that something is true|I was skeptical of the amazing claim until I saw proof.
simplify|clarify,ease,streamline|to make something easier to understand or do|A diagram can simplify the complicated instructions.
solemn|serious,grave,formal|serious and quiet in manner|The class grew solemn during the memorial ceremony.
sporadic|irregular,occasional,scattered|happening at uneven or unpredictable times|Sporadic showers appeared throughout the afternoon.
sprawl|spread,stretch,extend|to spread out over a large area|The growing city began to sprawl across the valley.
spite|malice,resentment,ill will|a desire to hurt or annoy someone|He hid the ball out of spite after losing the game.
straightforward|direct,clear,simple|easy to understand and not complicated|The straightforward directions led us to the cabin.
sustain|support,maintain,uphold|to keep something going or provide what it needs|The small stream can sustain wildlife during the dry season.
sympathy|compassion,concern,understanding|care for someone who is suffering|We felt sympathy for the runner who injured her ankle.
tantrum|outburst,fit,meltdown|a sudden display of anger or frustration|The tired toddler had a tantrum in the store.
temperate|mild,moderate,gentle|neither extremely hot nor extremely cold|The island has a temperate climate throughout the year.
temperamental|moody,unpredictable,changeable|likely to change moods or behavior suddenly|The temperamental printer works well one day and jams the next.
thrifty|frugal,economical,careful|careful about spending or using resources|A thrifty shopper compares prices before buying.
timid|shy,fearful,hesitant|lacking courage or confidence|The timid kitten hid when visitors arrived.
tonic|medicine,remedy,restorative|something believed to restore health or energy|The traveler drank a herbal tonic after the long journey.
tread|walk,step,trample|to put your feet down while walking|Tread carefully because the stones are slippery.
truce|peace,ceasefire,agreement|an agreement to stop fighting for a time|The two teams called a truce and shared the field.
tyrant|dictator,despot,oppressor|a ruler who uses power in a cruel unfair way|The tyrant punished anyone who questioned his orders.
unearth|discover,uncover,reveal|to find something hidden or buried|Archaeologists hope to unearth ancient tools at the site.
uniform|consistent,even,identical|the same throughout without much variation|The tiles should have a uniform color and size.
vengeance|revenge,retaliation,payback|punishment given in return for a wrong|The hero chose justice instead of vengeance.
vigilance|watchfulness,alertness,attention|careful attention to possible danger or trouble|The lifeguard’s vigilance kept the swimmers safe.
virtue|goodness,morality,excellence|a good moral quality|Patience is a virtue when teaching someone a new skill.
vital|essential,crucial,necessary|absolutely necessary or very important|Roots play a vital role in carrying water to the plant.
validate|verify,confirm,support|to show that something is accurate or reasonable|A second experiment can validate the first result.
wistful|yearning,longing,nostalgic|showing a quiet sadness for something desired or remembered|She gave a wistful smile while looking at old photographs.
withered|shriveled,dried,shrunken|dried up and weak|The withered leaves crumbled in my hand.
unity|union,togetherness,harmony|the state of being joined or working together|The team showed unity by helping every member finish.
cackle|laugh,chortle,harsh laughter|a loud sharp laugh|The witch in the play began to cackle after revealing her trick.
`.trim();

export const LOWER_LEVEL_FLASHCARD_DETAILS = new Map<string, LowerLevelFlashcardDetail>(
  DETAIL_ROWS.split('\n').map((row, index) => {
    const [word, synonymsText, definition, example] = row.split('|');
    const synonyms = synonymsText?.split(',').map((synonym) => synonym.trim()).filter(Boolean);
    if (!word || !synonyms || synonyms.length < 3 || !definition || !example) {
      throw new Error(`Broken Lower Level flashcard detail row ${index + 1}`);
    }
    return [word, { synonyms, definition, example }];
  }),
);
