export type User = {
  id: string;
  email: string;
  name: string;
  cnic?: string;
  phone?: string;
  avatarUrl: string | null;
  accountReady?: boolean;
  emailVerified?: boolean;
  phoneVerified?: boolean;
  cnicDocumentUploaded?: boolean;
  ratingAvg?: number | null;
  ratingCount?: number;
};

export type DriverSummary = {
  id: string;
  name: string;
  avatarUrl: string | null;
  email?: string;
  phone?: string;
  cnic?: string;
  ratingAvg?: number | null;
  ratingCount?: number;
};

export type JoinRequestSummary = {
  id: string;
  rideId: string;
  status: string;
  currentFare: number;
  proposedBy: 'rider' | 'driver';
  rider?: { id: string; name: string; avatarUrl: string | null };
  ride?: { id: string; from: string; to: string; when: string };
  createdAt?: string;
  updatedAt?: string;
  chatThreadId?: string;
};

export type Ride = {
  id: string;
  from: string;
  to: string;
  when: string;
  seatCount: number;
  passengerIds: string[];
  fromLat: number | null;
  fromLng: number | null;
  toLat: number | null;
  toLng: number | null;
  distanceKm?: number;
  cancelled?: boolean;
  status?: 'scheduled' | 'active' | 'completed';
  liveDriverLat?: number | null;
  liveDriverLng?: number | null;
  driver: DriverSummary | null;
  myJoinRequest?: JoinRequestSummary | null;
  chatThreadId?: string | null;
};

export type Review = {
  id: string;
  rating: number;
  comment: string;
  role: 'driver' | 'rider';
  createdAt: string;
  ride: { id: string; from: string; to: string; when: string } | null;
  reviewer: { id: string; name: string; avatarUrl: string | null } | null;
};

export type AppNotification = {
  id: string;
  kind: string;
  title: string;
  message: string;
  read: boolean;
  rideId: string | null;
  joinRequestId: string | null;
  createdAt: string;
};

export type ChatMessage = {
  id: string;
  fromId: string;
  body: string;
  at: string;
};

export type ChatThread = {
  id: string;
  rideId: string;
  riderId: string;
  driverId: string;
  ride?: { id: string; from: string; to: string; when: string } | null;
  messages: ChatMessage[];
};
