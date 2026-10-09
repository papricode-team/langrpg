/** Reviewed contacts in the existing painted masters. Limits reject new damaged sources.
 * Keys are zero-based column : boundary row. No figure pixels are repainted.
 */
export const reviewedPeopleSeams={
 'cedarbay-people-2':{
  contacts:{'0:2':10,'1:2':10,'2:2':10,'3:2':10},
  note:'Adjacent sole and hair contours meet at a narrow edge. Preserve the minimum-alpha separator.',
 },
 'kigalights-people-1':{
  contacts:{'0:5':10,'1:5':10,'2:5':10,'3:5':10},
  note:'Adjacent sole and hair contours meet at a narrow edge. Preserve the minimum-alpha separator.',
 },
 'rainmarket-people-2':{
  ranges:{'2:3':{minimum:732,maximum:752}},
  contacts:{'0:3':12,'2:3':16},
  note:'The woman’s shoe meets the elder’s hat. Keep the separator at that contact; a calf-level minimum would sever her lower leg.',
 },
 'seoulsteps-people-2':{
  contacts:{'0:1':14,'1:1':15,'2:1':14,'3:1':14},
  protectWarmContours:['0:1','1:1','2:1','3:1'],
  note:'The upper bare ankle touches the lower dark hair. Protect its warm painted contour so an ankle fragment cannot become a point on the next person’s head.',
 },
};
