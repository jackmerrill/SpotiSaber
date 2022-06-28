import { Listbox, Switch, Transition } from "@headlessui/react";
import { Spotify } from "@icons-pack/react-simple-icons";
import { signIn } from "next-auth/react";
import { useSession } from "next-auth/react";
import { Fragment, useEffect, useState } from "react";
import { classNames, wait } from "../util/helpers";
import {
  Playlist,
  SpotifyResponse,
  PlaylistTrack,
  BeatSaberPlaylist,
} from "../util/types";
import {
  CheckIcon,
  DownloadIcon,
  MinusIcon,
  MusicNoteIcon,
  RefreshIcon,
  SelectorIcon,
  XIcon,
} from "@heroicons/react/outline";
import Modal from "../components/Modal";
import BeatSaverAPI from "beatsaver-api";
import { MapDetail } from "beatsaver-api/lib/models/MapDetail";
import { SortOrder } from "beatsaver-api/lib/api/search";
import Head from "next/head";

const RATELIMIT = 500;

export default function IndexPage() {
  const { data, status } = useSession();

  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [selected, setSelected] = useState<Playlist | null>(null);
  const [createPlaylist, setCreatePlaylist] = useState<boolean>(false);

  const [converting, setConverting] = useState<boolean>(false);

  const [playlistSongs, setPlaylistSongs] = useState<PlaylistTrack[]>([]);
  const [convertedSongs, setConvertedSongs] = useState<MapDetail[]>([]);

  const [songsStatus, setSongsStatus] = useState<
    { id: string; error: boolean; found: boolean | null; loading: boolean }[]
  >([]);

  useEffect(() => {
    if (data) {
      fetch("https://api.spotify.com/v1/me/playlists?limit=50", {
        headers: {
          Authorization: `Bearer ${data.accessToken}`,
          "Content-Type": "application/json",
        },
      })
        .then((res) => res.json())
        .then((res: SpotifyResponse<Playlist>) => {
          setPlaylists(res.items);
        });
    }
  }, [data]);

  useEffect(() => {
    if (selected && data) {
      setPlaylistSongs([]);
      const GetSongs = (url?: string) => {
        fetch(
          url ??
            `https://api.spotify.com/v1/playlists/${selected.id}/tracks?limit=50`,
          {
            headers: {
              Authorization: `Bearer ${data.accessToken}`,
              "Content-Type": "application/json",
            },
          }
        )
          .then((res) => res.json())
          .then((res: SpotifyResponse<PlaylistTrack>) => {
            if (res.next) {
              GetSongs(res.next);
            }
            setPlaylistSongs((prev) => [...prev, ...res.items]);
          });
      };

      GetSongs();
    }
  }, [selected, data]);

  const startConvert = async () => {
    setConverting(true);
    const convertedSongs: MapDetail[] = [];
    setSongsStatus(
      playlistSongs.map((song) => ({
        id: song.track.id,
        error: false,
        found: false,
        loading: true,
      }))
    );

    const BSAPI = new BeatSaverAPI({
      AppName: "SpotiSaber",
      Version: "1.0.0",
    });

    for (const song of playlistSongs) {
      try {
        const res = await BSAPI.searchMaps({
          q: `${song.track.name} ${song.track.artists[0].name}`,
          sortOrder: SortOrder.Relevance,
        });

        if (res.docs.length === 0) {
          setSongsStatus((prev) =>
            prev.map((s) =>
              s.id === song.track.id
                ? { ...s, error: false, found: false, loading: false }
                : s
            )
          );
        }

        if (res.docs.length > 0) {
          if (!song.track.artists[0]) {
            throw new Error("No artist found");
          }

          const actualSong = res.docs.find(
            (s) =>
              s.name.toLowerCase().includes(song.track.name.toLowerCase()) &&
              (s.metadata.songAuthorName
                .toLowerCase()
                .includes((song.track.artists[0].name ?? "").toLowerCase()) ||
                s.metadata.songSubName
                  .toLowerCase()
                  .includes((song.track.artists[0].name ?? "").toLowerCase()))
          );
          if (actualSong) {
            setSongsStatus((prev) =>
              prev.map((s) =>
                s.id === song.track.id
                  ? { ...s, found: true, error: false, loading: false }
                  : s
              )
            );
            convertedSongs.push(actualSong);
          } else {
            setSongsStatus((prev) =>
              prev.map((s) =>
                s.id === song.track.id
                  ? { ...s, error: true, found: false, loading: false }
                  : s
              )
            );
          }
        }
      } catch (e) {
        console.error(e);
        setSongsStatus((prev) =>
          prev.map((s) =>
            s.id === song.track.id ? { ...s, error: true, loading: false } : s
          )
        );
      }
      await wait(RATELIMIT);
    }

    setConvertedSongs(convertedSongs);

    if (!selected) {
      return;
    }

    if (!createPlaylist) return;

    const playlistData: BeatSaberPlaylist = {
      playlistTitle: selected.name,
      playlistAuthor: selected.owner.display_name,
      playlistDescription: `${selected.description}\n\nGenerated with SpotiSaber.`,
      songs: convertedSongs.map((s) => ({
        key: s.versions[0].key,
        hash: s.versions[0].hash,
        uploader: s.uploader.name,
        name: s.name,
      })),
    };

    // package the playlist into a file
    const blob = new Blob([JSON.stringify(playlistData)], {
      type: "application/json",
    });

    // create a link to the file
    const url = URL.createObjectURL(blob);

    // create a link to the file
    const a = document.createElement("a");
    a.href = url;
    a.download = `${selected.name}.bplist`;
    a.click();

    // revoke the link to the file
    URL.revokeObjectURL(url);
    setConverting(false);
  };

  const downloadAll = () => {
    convertedSongs.forEach((song) => {
      const a = document.createElement("a");
      a.href = `beatsaver://${song.versions[0].key}`;
      a.click();
    });
  };

  return (
    <div className="relative flex min-h-screen flex-col justify-center overflow-hidden py-6 sm:py-12">
      <Head>
        <title>SpotiSaber</title>
      </Head>
      <div className="relative bg-white px-6 py-8 shadow-xl space-y-4 sm:mx-auto sm:max-w-lg w-full sm:rounded-lg sm:px-10">
        <h1 className="font-bold text-4xl text-center">
          <span className="text-green-400">Spoti</span>
          <span className="text-blue-600">Saber</span>
        </h1>
        {status === "loading" ? (
          <>
            <p className="text-gray-600">Loading...</p>
          </>
        ) : (
          <>
            {(status === "unauthenticated" || !data) && (
              <button
                onClick={() => signIn("spotify", { redirect: true })}
                className="bg-green-400 w-full px-3 text-white font-bold py-2 text-center justify-center items-center flex rounded-md"
              >
                <Spotify className="w-6 h-6" />
                <span className="ml-2">Sign in with Spotify</span>
              </button>
            )}
            {status === "authenticated" && (
              <div className="space-y-4">
                <h1 className="font-bold text-2xl text-center text-gray-800">
                  Welcome, {data.user?.name}!
                </h1>
                {playlists.length > 0 ? (
                  <div>
                    <Listbox value={selected} onChange={setSelected}>
                      {({ open }) => (
                        <>
                          <Listbox.Label className="block text-sm font-medium text-gray-700">
                            Playlist
                          </Listbox.Label>
                          <div className="mt-1 relative">
                            <Listbox.Button className="relative w-full bg-white border border-gray-300 rounded-md shadow-sm pl-3 pr-10 py-2 text-left cursor-default focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm">
                              {selected ? (
                                <>
                                  <span className="flex items-center">
                                    <img
                                      src={selected.images[0].url}
                                      alt=""
                                      className="flex-shrink-0 h-6 w-6 rounded-full"
                                    />
                                    <span className="ml-3 block truncate">
                                      {selected.name}
                                    </span>
                                  </span>
                                  <span className="ml-3 absolute inset-y-0 right-0 flex items-center pr-2 pointer-events-none">
                                    <SelectorIcon
                                      className="h-5 w-5 text-gray-400"
                                      aria-hidden="true"
                                    />
                                  </span>
                                </>
                              ) : (
                                <>
                                  <span className="flex items-center">
                                    <div className="flex-shrink-0 h-6 w-6 rounded-full bg-gray-500" />
                                    <span className="ml-3 block truncate">
                                      Select a playlist
                                    </span>
                                  </span>
                                  <span className="ml-3 absolute inset-y-0 right-0 flex items-center pr-2 pointer-events-none">
                                    <SelectorIcon
                                      className="h-5 w-5 text-gray-400"
                                      aria-hidden="true"
                                    />
                                  </span>
                                </>
                              )}
                            </Listbox.Button>

                            <Transition
                              show={open}
                              as={Fragment}
                              leave="transition ease-in duration-100"
                              leaveFrom="opacity-100"
                              leaveTo="opacity-0"
                            >
                              <Listbox.Options className="absolute z-10 mt-1 w-full bg-white shadow-lg max-h-56 rounded-md py-1 text-base ring-1 ring-black ring-opacity-5 overflow-auto focus:outline-none sm:text-sm">
                                {playlists.map((playlist) => (
                                  <Listbox.Option
                                    key={playlist.id}
                                    className={({ active }) =>
                                      classNames(
                                        active
                                          ? "text-white bg-indigo-600"
                                          : "text-gray-900",
                                        "cursor-default select-none relative py-2 pl-3 pr-9"
                                      )
                                    }
                                    value={playlist}
                                  >
                                    {({ selected, active }) => (
                                      <>
                                        <div className="flex items-center">
                                          <img
                                            src={playlist.images[0].url}
                                            alt=""
                                            className="flex-shrink-0 h-6 w-6 rounded-full"
                                          />
                                          <span
                                            className={classNames(
                                              selected
                                                ? "font-semibold"
                                                : "font-normal",
                                              "ml-3 block truncate"
                                            )}
                                          >
                                            {playlist.name}
                                          </span>
                                        </div>

                                        {selected ? (
                                          <span
                                            className={classNames(
                                              active
                                                ? "text-white"
                                                : "text-indigo-600",
                                              "absolute inset-y-0 right-0 flex items-center pr-4"
                                            )}
                                          >
                                            <CheckIcon
                                              className="h-5 w-5"
                                              aria-hidden="true"
                                            />
                                          </span>
                                        ) : null}
                                      </>
                                    )}
                                  </Listbox.Option>
                                ))}
                              </Listbox.Options>
                            </Transition>
                          </div>
                        </>
                      )}
                    </Listbox>
                  </div>
                ) : (
                  <div className="w-full h-full block rounded-md bg-gray-300 animate-pulse"></div>
                )}
                <Switch.Group
                  as="div"
                  className="flex items-center justify-between"
                >
                  <span className="flex-grow flex flex-col">
                    <Switch.Label
                      as="span"
                      className="text-sm font-medium text-gray-900"
                      passive
                    >
                      Create Playlist
                    </Switch.Label>
                    <Switch.Description
                      as="span"
                      className="text-sm text-gray-500"
                    >
                      Creates a Beat Saber playlist to play.
                    </Switch.Description>
                  </span>
                  <Switch
                    checked={createPlaylist}
                    disabled={!selected}
                    onChange={setCreatePlaylist}
                    className={classNames(
                      createPlaylist ? "bg-indigo-600" : "bg-gray-200",
                      "relative inline-flex flex-shrink-0 h-6 w-11 border-2 border-transparent rounded-full cursor-pointer transition-colors ease-in-out duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                    )}
                  >
                    <span
                      aria-hidden="true"
                      className={classNames(
                        createPlaylist ? "translate-x-5" : "translate-x-0",
                        "pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transform ring-0 transition ease-in-out duration-200"
                      )}
                    />
                  </Switch>
                </Switch.Group>

                <button
                  disabled={!selected}
                  onClick={startConvert}
                  className="bg-indigo-500 disabled:opacity-75 disabled:cursor-not-allowed rounded-md w-full text-xl text-white font-bold flex gap-x-2 justify-center items-center px-3 py-2"
                >
                  <MusicNoteIcon className="h-6 w-6" aria-hidden="true" />
                  Convert!
                </button>

                <Modal
                  open={converting}
                  setOpen={setConverting}
                  title="Converting Playlist"
                >
                  <p>
                    Estimated time:{" "}
                    {Math.round(playlistSongs.length * (RATELIMIT + 250)) /
                      1000}{" "}
                    seconds
                  </p>
                  <div className="grid grid-cols-4 gap-y-2">
                    {converting &&
                      playlistSongs.map((song) => (
                        <>
                          <div className="grid grid-cols-4 items-center space-x-2 col-span-3">
                            <img
                              src={song.track.album.images[0].url}
                              alt=""
                              className="h-12 w-12 rounded-md"
                            />

                            <div className="col-span-3">
                              <p className="text-sm text-left text-gray-600 truncate">
                                {song.track.name}
                              </p>
                              <p className="text-xs text-left text-gray-500 truncate">
                                {song.track.artists
                                  .map((artist) => artist.name)
                                  .join(", ")}
                              </p>
                            </div>
                          </div>
                          <div className="col-span-1 flex justify-end items-center pr-1">
                            {songsStatus.find((s) => s.id === song.track.id)
                              ?.found && (
                              <div className="rounded-full w-min h-min p-0.5 bg-green-500 text-white flex items-center justify-center">
                                <CheckIcon className="h-5 w-5" />
                              </div>
                            )}
                            {(!songsStatus.find((s) => s.id === song.track.id)
                              ?.found ||
                              songsStatus.find((s) => s.id === song.track.id)
                                ?.error) &&
                              !songsStatus.find((s) => s.id === song.track.id)
                                ?.loading && (
                                <div className="rounded-full w-min h-min p-0.5 bg-red-500 text-white flex items-center justify-center">
                                  <XIcon className="h-5 w-5" />
                                </div>
                              )}
                            {songsStatus.find((s) => s.id === song.track.id)
                              ?.loading && (
                              <div className="rounded-full w-min h-min p-0.5 bg-amber-500 animate-spin text-white flex items-center justify-center">
                                <RefreshIcon className="h-5 w-5" />
                              </div>
                            )}
                          </div>
                        </>
                      ))}
                  </div>
                  {songsStatus.every((s) => !s.loading) && !createPlaylist && (
                    <button
                      onClick={() => downloadAll()}
                      className="bg-indigo-500 rounded-md mt-2 w-full text-xl text-white font-bold flex gap-x-2 justify-center items-center px-3 py-2"
                    >
                      <DownloadIcon className="h-6 w-6" aria-hidden="true" />
                      Download All
                    </button>
                  )}
                </Modal>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
