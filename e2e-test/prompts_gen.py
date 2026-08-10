from typing import Annotated, Literal, Union
from pydantic import BaseModel, Field


class T_Meta:
 temperature: float
 foobar: 'T_Meta_Foobar'
 zooBar: 'T_Meta_ZooBar'


type T_Meta_Foobar = Literal[
 'foo',
 'bar',
]


type T_Meta_ZooBar = Annotated[
 Union[
  'T_Meta_ZooBar_KindFoo',
  'T_Meta_ZooBar_KindBar',
 ],
 Field(discriminator="kind")
]


class T_Meta_ZooBar_KindFoo:
 kind: Literal['foo']
 foo: str


class T_Meta_ZooBar_KindBar:
 kind: Literal['bar']
 bar: str

