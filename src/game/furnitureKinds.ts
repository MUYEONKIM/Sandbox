import { MORE_KINDS } from '../roomMore';

/**
 * 인벤토리 꾸미기 › 가구 탭 안의 작은 분류(2026-11-27 사용자 "가구도 내부에 탭이 나뉘어 지면 좋겠다"). 분류 이름과 차례는 PM이 정했다.
 * 어느 가구가 어느 분류인지는 디자인 json의 종류(kind)를 따르고, 종류가 없거나 분류에 없는 종류(주방·욕실·아이 방 등)는 쓰임으로 골랐다
 * (예: 바 의자는 의자·소파, 아일랜드 식탁은 탁자·책상, 요와 아기 침대는 침대, 가스레인지는 가전). 고른 것은 제가 정한 것이다.
 * 난간은 단·계단과 한 분류라 벽 탭에서 이 탭으로 옮겼다. 표에 없는 새 가구는 이름으로 고르고, 맞는 것이 없으면 기타다.
 */
export const FURNITURE_KINDS = {
  bed: '침대',
  seat: '의자·소파',
  table: '탁자·책상',
  storage: '수납',
  light: '조명',
  appliance: '가전',
  dais: '단상·계단·난간',
  other: '기타',
} as const;
export type FurnitureKind = keyof typeof FURNITURE_KINDS;
export const FURNITURE_KIND_IDS = Object.keys(FURNITURE_KINDS) as FurnitureKind[];

/** 분류마다 가구 이름(방향 번호 _1·_2…를 뗀 id). 여기 없는 것만 이름으로 고른다. */
const LISTED: Record<FurnitureKind, readonly string[]> = {
  bed: [
    'rd_bed_single', 'rd_bed_double_oak', 'rd_bed_double_white', 'rd_bed_bunk', 'rd_bed_canopy', 'rd_bed_single_navy', 'rd_bed_single_sage',
    'rd_bed_iron', 'rd_bed_low', 'rd_daybed', 'rd_hammock', 'rd_bed_drawer', 'rd_sleeping_bag', 'rd_futon_yo', 'rd_crib',
  ],
  seat: [
    'rd_chair_wood', 'rd_stool_round', 'rd_sofa_two', 'rd_chair_rocking', 'rd_beanbag', 'rd_chair_office', 'rd_chair_wood_navy', 'rd_chair_wood_rose',
    'rd_armchair', 'rd_sofa_long', 'rd_bench_wood', 'rd_floor_chair', 'rd_papasan', 'rd_bar_stool', 'rd_sofa_bed', 'rd_sofa_chester', 'rd_sofa_corner',
    'rd_ottoman', 'rd_chair_egg', 'rd_chair_camp', 'rd_chair_massage', 'rd_chair_high',
  ],
  table: [
    'rd_table_oak', 'rd_desk_drawer', 'rd_table_low', 'rd_table_cafe', 'rd_vanity', 'rd_table_big', 'rd_table_glass', 'rd_table_coffee', 'rd_table_long',
    'rd_desk_hutch', 'rd_kotatsu', 'rd_console', 'rd_table_marble', 'rd_table_bar', 'rd_desk_low', 'rd_table_island',
  ],
  storage: [
    'rd_dresser_white', 'rd_wardrobe_oak', 'rd_bookshelf_tall', 'rd_nightstand', 'rd_dresser_tall', 'rd_cupboard_kitchen', 'rd_bookcase_small',
    'rd_basket_rattan', 'rd_box_cardboard', 'rd_coat_rack', 'rd_shelf_cube', 'rd_cabinet_dish', 'rd_shoe_cabinet', 'rd_chest_wood', 'rd_shelf_ladder',
    'rd_locker', 'rd_tv_stand_low', 'rd_kitchen_counter', 'rd_toy_chest', 'rd_wardrobe_pearl', 'rd_chest_bandaji', 'rd_rack_wine', 'rd_cabinet_glass',
    'rd_rack_clothes', 'rd_safe', 'rd_umbrella_stand', 'rd_trolley', 'rd_recycle_bins', 'rd_mirror_stand',
  ],
  light: ['rd_lamp_floor', 'rd_lantern_paper', 'rd_lamp_arc', 'rd_lantern_stone', 'rd_fireplace'],
  appliance: [
    'rd_tv_big', 'rd_fridge', 'rd_fan_stand', 'rd_heater_round_on', 'rd_heater_round_off', 'rd_robot_vacuum', 'rd_aircon_stand', 'rd_air_purifier',
    'rd_speaker_tall', 'rd_washer', 'rd_kitchen_stove', 'rd_water_cooler', 'rd_fridge_kimchi', 'rd_ironing_board',
  ],
  dais: [
    'rd_dais_walnut', 'rd_dais_oak', 'rd_dais_white', 'rd_dais_stone', 'rd_dais_carpet', 'rd_dais_tatami',
    'rd_steps_oak', 'rd_steps_walnut', 'rd_steps_white', 'rd_steps_stone', 'rd_steps_carpet',
    'rd_wall_rail', 'rd_rail_oak', 'rd_rail_white', 'rd_rail_glass', 'rd_rail_iron', 'rd_rail_rope',
  ],
  other: [
    'rd_cat_tower', 'rd_gift_big', 'rd_coat_rack_xmas', 'rd_kitchen_sink', 'rd_bathtub', 'rd_toilet', 'rd_washbasin', 'rd_shower_booth',
    'rd_bath_mat', 'rd_laundry_basket', 'rd_plant_monstera', 'rd_plant_tall', 'rd_plant_palm', 'rd_xmas_tree_big', 'rd_cushion_rose', 'rd_rug_round',
    'rd_rug_stripe', 'rd_rug_big', 'rd_cushion_check', 'rd_blanket', 'rd_slippers', 'rd_doormat', 'rd_rug_sheep', 'rd_rug_runner', 'rd_rug_persian',
    'rd_rug_jute', 'rd_rug_flower', 'rd_easel', 'rd_guitar_stand', 'rd_piano_upright', 'rd_baduk', 'rd_telescope', 'rd_yoga_mat', 'rd_yut_board',
    'rd_rocking_horse', 'rd_play_tent', 'rd_slide', 'rd_rug_cloud', 'rd_plant_olive', 'rd_plant_bamboo', 'rd_plant_rubber', 'rd_rug_checker',
    'rd_mat_hwamunseok', 'rd_rug_star', 'rd_rug_halfmoon', 'rd_mat_baby', 'rd_dog_house', 'rd_table_pingpong', 'rd_table_pool', 'rd_treadmill',
    'rd_bike_indoor', 'rd_arcade', 'rd_drum_set', 'rd_cello', 'rd_firewood', 'rd_sleigh', 'rd_ball_pit',
  ],
};

const KIND = new Map<string, FurnitureKind>();
for (const [kind, ids] of Object.entries(LISTED) as [FurnitureKind, readonly string[]][]) for (const id of ids) KIND.set(id, kind);

/** 표에 없는 새 가구를 이름으로 고르는 차례(앞이 먼저). 침대보다 '소파침대'처럼 앞 낱말이 먼저 맞는 것은 표에 넣는다. */
const BY_NAME: readonly [RegExp, FurnitureKind][] = [
  [/단상|계단|난간/, 'dais'],
  [/침대|해먹|침낭|요\(/, 'bed'],
  [/의자|소파|스툴|벤치|빈백|오토만/, 'seat'],
  [/탁자|책상|식탁|테이블|밥상|서안|화장대/, 'table'],
  [/장롱|옷장|서랍|선반|책장|책꽂이|찬장|수납|궤짝|상자|사물함|진열장|행거|옷걸이|바구니/, 'storage'],
  [/스탠드|등$|조명|램프|전등|촛대|샹들리에/, 'light'],
  [/냉장고|세탁기|TV|에어컨|선풍기|청정기|청소기|스피커|정수기|건조기|오븐|전자레인지|난로/, 'appliance'],
];

const found = new Map<string, FurnitureKind>();

/** 가구 id(방향 번호가 붙어도 됨)의 작은 분류. 이름은 표에 없을 때만 본다. 한 번 고른 것은 기억한다. */
export function furnitureKindOf(id: string, name = ''): FurnitureKind {
  let kind = found.get(id);
  if (kind) return kind;
  const base = id.replace(/_\d+$/, '');
  kind = KIND.get(base) ?? KIND.get(id) ?? ((MORE_KINDS[base] ?? MORE_KINDS[id]) as FurnitureKind | undefined);
  kind ??= BY_NAME.find(([pattern]) => pattern.test(name))?.[1] ?? 'other';
  found.set(id, kind);
  return kind;
}
