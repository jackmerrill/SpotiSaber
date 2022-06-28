import NextAuth from "next-auth";
import SpotifyProvider from "next-auth/providers/spotify";

if (!process.env.SPOTIFY_ID || !process.env.SPOTIFY_SECRET) {
  throw new Error("SPOTIFY_ID and SPOTIFY_SECRET must be set");
}

export default NextAuth({
  providers: [
    SpotifyProvider({
      clientId: process.env.SPOTIFY_ID,
      clientSecret: process.env.SPOTIFY_SECRET,
      authorization:
        "https://accounts.spotify.com/authorize?scope=user-read-email%20playlist-read-private",
    }),
  ],
  callbacks: {
    async jwt({ token, account }) {
      if (account) {
        token.accessToken = account.access_token;
      }
      return token;
    },
    async session({ session, token }) {
      session.id = token.sub;
      session.accessToken = token.accessToken;
      session.error = token.error;

      return session;
    },
  },
});
